import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

// Mock site config
vi.mock('@/config/site', () => ({
  siteConfig: {
    couple: {
      groom: { name: '张三' },
      bride: { name: '李四' },
      separator: '与',
    },
    eventDate: '2026-12-25',
  },
}))

describe('Hero 组件', () => {
  it('正确渲染新郎新娘名字', () => {
    render(<Hero />)
    expect(screen.getByText(/张三.*李四/)).toBeInTheDocument()
  })

  it('渲染保存日期文字', () => {
    render(<Hero />)
    expect(screen.getByText('SAVE THE DATE')).toBeInTheDocument()
  })

  it('渲染日期', () => {
    render(<Hero />)
    expect(screen.getByText(/2026年12月25日/)).toBeInTheDocument()
  })

  it('渲染向下滚动箭头', () => {
    render(<Hero />)
    const svg = document.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
