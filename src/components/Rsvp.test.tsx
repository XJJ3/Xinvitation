import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Rsvp } from './Rsvp'

// Mock framer-motion
vi.mock('framer-motion', () => {
  const MockDiv = ({ children, ...props }: any) => <div {...props}>{children}</div>
  const MockH2 = ({ children, ...props }: any) => <h2 {...props}>{children}</h2>
  const MockForm = ({ children, ...props }: any) => <form {...props}>{children}</form>
  const MockButton = ({ children, ...props }: any) => <button {...props}>{children}</button>
  
  return {
    motion: {
      h2: MockH2,
      form: MockForm,
      div: MockDiv,
      button: MockButton,
    },
  }
})

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Rsvp 组件', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('渲染 RSVP 标题', () => {
    render(<Rsvp />)
    expect(screen.getByText('RSVP')).toBeInTheDocument()
  })

  it('渲染姓名输入框', () => {
    render(<Rsvp />)
    expect(screen.getByLabelText('姓名 *')).toBeInTheDocument()
  })

  it('渲染邮箱输入框', () => {
    render(<Rsvp />)
    expect(screen.getByLabelText(/邮箱/)).toBeInTheDocument()
  })

  it('渲染参加选项', () => {
    render(<Rsvp />)
    expect(screen.getByLabelText('能参加')).toBeInTheDocument()
    expect(screen.getByLabelText('无法参加')).toBeInTheDocument()
  })

  it('渲染参加人数选择器', () => {
    render(<Rsvp />)
    expect(screen.getByLabelText('参加人数 *')).toBeInTheDocument()
  })

  it('渲染留言文本框', () => {
    render(<Rsvp />)
    expect(screen.getByLabelText('留言')).toBeInTheDocument()
  })

  it('渲染提交按钮', () => {
    render(<Rsvp />)
    expect(screen.getByRole('button', { name: '提交 RSVP' })).toBeInTheDocument()
  })

  it('可以输入表单数据', async () => {
    const user = userEvent.setup()
    render(<Rsvp />)
    
    const nameInput = screen.getByLabelText('姓名 *')
    await user.type(nameInput, '测试用户')
    
    expect(nameInput).toHaveValue('测试用户')
  })

  it('提交表单成功显示成功消息', async () => {
    const user = userEvent.setup()
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'RSVP提交成功' })
    })
    
    render(<Rsvp />)
    
    await user.type(screen.getByLabelText('姓名 *'), '测试用户')
    await user.click(screen.getByRole('button', { name: '提交 RSVP' }))
    
    await waitFor(() => {
      expect(screen.getByText(/感谢您的回复/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('提交表单失败显示错误消息', async () => {
    const user = userEvent.setup()
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '提交失败' })
    })
    
    render(<Rsvp />)
    
    await user.type(screen.getByLabelText('姓名 *'), '测试用户')
    await user.click(screen.getByRole('button', { name: '提交 RSVP' }))
    
    await waitFor(() => {
      expect(screen.getByText('提交失败,请稍后重试。')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('验证必填字段', async () => {
    const user = userEvent.setup()
    render(<Rsvp />)
    
    await user.click(screen.getByRole('button', { name: '提交 RSVP' }))
    
    const nameInput = screen.getByLabelText('姓名 *')
    expect(nameInput).toBeInvalid()
  })
})
