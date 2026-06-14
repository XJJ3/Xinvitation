import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Guestbook } from './Guestbook'

// Mock framer-motion
vi.mock('framer-motion', () => {
  const MockDiv = ({ children, ...props }: any) => <div {...props}>{children}</div>
  const MockH2 = ({ children, ...props }: any) => <h2 {...props}>{children}</h2>
  const MockH3 = ({ children, ...props }: any) => <h3 {...props}>{children}</h3>
  const MockH4 = ({ children, ...props }: any) => <h4 {...props}>{children}</h4>
  const MockP = ({ children, ...props }: any) => <p {...props}>{children}</p>
  const MockForm = ({ children, ...props }: any) => <form {...props}>{children}</form>
  const MockButton = ({ children, ...props }: any) => <button {...props}>{children}</button>
  const MockSpan = ({ children, ...props }: any) => <span {...props}>{children}</span>
  
  return {
    motion: {
      h2: MockH2,
      h3: MockH3,
      h4: MockH4,
      div: MockDiv,
      p: MockP,
      form: MockForm,
      button: MockButton,
      span: MockSpan,
    },
  }
})

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Guestbook 组件', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('渲染留言祝福标题', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    render(<Guestbook />)
    expect(screen.getByText('留言祝福')).toBeInTheDocument()
  })

  it('渲染留下祝福标题', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    render(<Guestbook />)
    expect(screen.getByText('留下祝福')).toBeInTheDocument()
  })

  it('渲染祝福墙标题', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    render(<Guestbook />)
    expect(screen.getByText('祝福墙')).toBeInTheDocument()
  })

  it('渲染姓名输入框', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    render(<Guestbook />)
    const nameInputs = screen.getAllByLabelText('姓名 *')
    expect(nameInputs[0]).toBeInTheDocument()
  })

  it('渲染祝福语输入框', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    render(<Guestbook />)
    const messageInputs = screen.getAllByLabelText('祝福语 *')
    expect(messageInputs[0]).toBeInTheDocument()
  })

  it('渲染提交按钮', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    render(<Guestbook />)
    expect(screen.getByRole('button', { name: '提交祝福' })).toBeInTheDocument()
  })

  it('加载时显示留言列表', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          { id: '1', name: '张三', message: '祝你们幸福美满！', createdAt: new Date().toISOString() },
          { id: '2', name: '李四', message: '期待见证你们的幸福时刻！', createdAt: new Date().toISOString() },
        ]
      })
    })
    
    render(<Guestbook />)
    
    await waitFor(() => {
      expect(screen.getByText('张三')).toBeInTheDocument()
    }, { timeout: 3000 })
    expect(screen.getByText('李四')).toBeInTheDocument()
  })

  it('没有留言时显示提示', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    
    render(<Guestbook />)
    
    await waitFor(() => {
      expect(screen.getByText('还没有祝福,快来留下您的祝福吧!')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('可以输入表单数据', async () => {
    const user = userEvent.setup()
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    
    render(<Guestbook />)
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交祝福' })).toBeInTheDocument()
    }, { timeout: 3000 })
    
    const nameInput = screen.getAllByLabelText('姓名 *')[0]
    await user.type(nameInput, '测试用户')
    
    expect(nameInput).toHaveValue('测试用户')
  })

  it('提交祝福成功显示成功消息', async () => {
    const user = userEvent.setup()
    
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ entries: [] })
    })
    
    // 提交成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: '祝福提交成功' })
    })
    
    render(<Guestbook />)
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交祝福' })).toBeInTheDocument()
    }, { timeout: 3000 })
    
    const nameInput = screen.getAllByLabelText('姓名 *')[0]
    const messageInput = screen.getAllByLabelText('祝福语 *')[0]
    
    await user.type(nameInput, '测试用户')
    await user.type(messageInput, '祝福你们！')
    await user.click(screen.getByRole('button', { name: '提交祝福' }))
    
    await waitFor(() => {
      expect(screen.getByText('祝福提交成功!')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('验证必填字段', async () => {
    const user = userEvent.setup()
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] })
    })
    
    render(<Guestbook />)
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交祝福' })).toBeInTheDocument()
    }, { timeout: 3000 })
    
    await user.click(screen.getByRole('button', { name: '提交祝福' }))
    
    const nameInput = screen.getAllByLabelText('姓名 *')[0]
    expect(nameInput).toBeInvalid()
  })
})
