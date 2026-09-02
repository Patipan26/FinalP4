const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('finalp4_token')
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) }

  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อ Backend ได้ กรุณาตรวจสอบว่าเปิด npm run dev แล้ว')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ API')
  return data
}

export const authApi = {
  register: (payload) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  googleLogin: (idToken) => apiRequest('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
  me: () => apiRequest('/auth/me'),
}
