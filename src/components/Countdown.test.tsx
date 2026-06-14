import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Countdown } from './Countdown'

// Mock framer-motion with proper component structure
vi.mock('framer-motion', () => {
  const React = require('react')
  return {
    motion: {
      h2: React.forwardRef(({ children, ...props }, ref) => 
        React.createElement('h2', { ref, ...props }, children)),
      div: React.forwardRef(({ children, ...props }, ref) => 
        React.createElement('div', { ref, ...props }, children)),
    },
  }
})

// Mock site config
vi.mock('@/config/site', () => ({
  siteConfig: {
    eventDate: '2099-12-31', // 未来日期，确保倒计时有值
  },
}))

describe('Countdown 组件', () => {
  it('正确渲染倒计时标题', async () => {
    render(<Countdown />)
    await waitFor(() => {
      expect(screen.getByText('距离我们的幸福时刻')).toBeInTheDocument()
    })
  })

  it('渲染天、时、分、秒标签', async () => {
    render(<Countdown />)
    await waitFor(() => {
      expect(screen.getByText('天')).toBeInTheDocument()
      expect(screen.getByText('时')).toBeInTheDocument()
      expect(screen.getByText('分')).toBeInTheDocument()
      expect(screen.getByText('秒')).toBeInTheDocument()
    })
  })

  it('渲染期望文字', async () => {
    render(<Countdown />)
    await waitFor(() => {
      expect(screen.getByText('期待与您共同见证这份美好')).toBeInTheDocument()
    })
  })
})
