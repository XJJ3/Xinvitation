import { http, HttpResponse, delay } from 'msw'

export const handlers = [
  // RSVP API
  http.post('/api/rsvp', async ({ request }) => {
    await delay(100)
    const body = await request.json() as { name: string; email: string }
    
    if (!body.name || !body.email) {
      return HttpResponse.json(
        { error: '请提供姓名和邮箱' },
        { status: 400 }
      )
    }
    
    return HttpResponse.json({
      success: true,
      message: 'RSVP提交成功！我们期待您的到来。'
    })
  }),

  // Guestbook API
  http.get('/api/guestbook', async () => {
    await delay(100)
    return HttpResponse.json({
      entries: [
        { id: '1', name: '张三', message: '祝你们幸福美满！', createdAt: new Date().toISOString() },
        { id: '2', name: '李四', message: '期待见证你们的幸福时刻！', createdAt: new Date().toISOString() },
      ]
    })
  }),

  http.post('/api/guestbook', async ({ request }) => {
    await delay(100)
    const body = await request.json() as { name: string; message: string }
    
    if (!body.name || !body.message) {
      return HttpResponse.json(
        { error: '请提供姓名和祝福语' },
        { status: 400 }
      )
    }
    
    if (body.message.length > 500) {
      return HttpResponse.json(
        { error: '祝福语不能超过500个字符' },
        { status: 400 }
      )
    }
    
    return HttpResponse.json({
      success: true,
      message: '感谢您的祝福！'
    })
  }),
]
