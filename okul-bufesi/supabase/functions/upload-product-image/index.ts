// Supabase Edge Function — upload-product-image
// Yalnız MANAGER rolündeki personel ürün görseli yükleyebilir.
// Servis anahtarı yalnız bu fonksiyonun sunucu ortamında bulunur.

import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_BYTES = 3 * 1024 * 1024
const BUCKET = 'product-images'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-staff-token',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function fail(message: string, status = 400): Response {
  return json({ error: message }, status)
}

function hasPngSignature(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return signature.every((value, index) => bytes[index] === value)
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return fail('Yalnız POST isteği kabul edilir.', 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('upload-product-image: eksik ortam değişkeni')
    return fail('Görsel yükleme servisi yapılandırılmamış.', 500)
  }

  const staffToken = request.headers.get('x-staff-token') ?? ''
  if (staffToken.length < 32) {
    return fail('Oturum doğrulanamadı. Lütfen yeniden giriş yapın.', 401)
  }

  // Personel oturumunu RPC üzerinden doğrula (servis anahtarı kullanmadan).
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: staff, error: authError } = await authClient.rpc('staff_me', { p_token: staffToken })

  if (authError || !staff || staff.role !== 'MANAGER') {
    return fail('Bu işlem için yetkiniz yok.', 403)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail('Dosya okunamadı.', 400)
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return fail('Görsel dosyası seçmelisiniz.', 400)
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return fail('Görsel en fazla 3 MB olabilir.', 413)
  }

  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return fail('Yalnız PNG ve JPEG görseller yüklenebilir.', 415)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const isPng = hasPngSignature(bytes)
  const isJpeg = hasJpegSignature(bytes)

  if (!isPng && !isJpeg) {
    return fail('Dosya içeriği geçerli bir PNG veya JPEG değil.', 415)
  }

  if ((file.type === 'image/png' && !isPng) || (file.type === 'image/jpeg' && !isJpeg)) {
    return fail('Dosya türü ile içerik birbiriyle uyuşmuyor.', 415)
  }

  const extension = isPng ? 'png' : 'jpg'
  const objectPath = `${staff.id}/${crypto.randomUUID()}.${extension}`

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType: file.type, upsert: false, cacheControl: '31536000' })

  if (uploadError) {
    console.error('upload-product-image: storage hatası', uploadError.message)
    return fail('Görsel yüklenemedi. Lütfen tekrar deneyin.', 500)
  }

  const { data: publicUrlData } = adminClient.storage.from(BUCKET).getPublicUrl(objectPath)

  if (!publicUrlData?.publicUrl) {
    return fail('Görsel adresi oluşturulamadı.', 500)
  }

  return json({ url: publicUrlData.publicUrl })
})
