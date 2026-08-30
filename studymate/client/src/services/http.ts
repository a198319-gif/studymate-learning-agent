import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

type RetryableRequest = InternalAxiosRequestConfig & { _csrfRetried?: boolean };

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

async function fetchCsrfToken(): Promise<string> {
  csrfRequest ??= http
    .get<{ csrfToken: string }>('/auth/csrf')
    .then((response) => response.data.csrfToken)
    .finally(() => {
      csrfRequest = null;
    });
  csrfToken = await csrfRequest;
  return csrfToken;
}

function isStateChanging(method?: string): boolean {
  return ['post', 'put', 'patch', 'delete'].includes(method?.toLowerCase() ?? '');
}

http.interceptors.request.use(async (config) => {
  if (isStateChanging(config.method)) {
    config.headers.set('X-CSRF-Token', csrfToken ?? (await fetchCsrfToken()));
  }
  return config;
});

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const request = error.config as RetryableRequest | undefined;
  const data = error.response?.data as { error?: { code?: string } } | undefined;

  if (request && data?.error?.code === 'CSRF_INVALID' && !request._csrfRetried) {
    request._csrfRetried = true;
    csrfToken = null;
    request.headers.set('X-CSRF-Token', await fetchCsrfToken());
    return http(request);
  }

  return Promise.reject(error);
});

export function getSafeApiError(error: unknown): string {
  const localizedMessages: Record<string, string> = {
    AUTH_EMAIL_EXISTS: '该邮箱已注册，请直接登录。',
    AUTH_INVALID_CREDENTIALS: '邮箱或密码不正确。',
    AUTH_REQUIRED: '请先登录后再继续。',
    AUTH_SESSION_INVALID: '登录状态已失效，请重新登录。',
    VALIDATION_ERROR: '提交的信息有误，请检查后重试。',
    RATE_LIMITED: '操作过于频繁，请稍后再试。',
    MATERIAL_FILE_REQUIRED: '请选择要上传的文件。',
    MATERIAL_FILE_TOO_LARGE: '文件大小不能超过 25 MB。',
    MATERIAL_UPLOAD_INVALID: '文件上传失败，请检查格式后重试。',
    MATERIAL_ARCHIVE_TOO_LARGE: '解压后的文档过大，无法安全处理。',
    MATERIAL_SIGNATURE_INVALID: '文件内容与扩展名不一致。',
    MATERIAL_TYPE_UNSUPPORTED: '请上传 PDF、DOCX、PPTX 或 TXT 文件。',
    MATERIAL_MIME_INVALID: '该文件类型不受支持。',
    MATERIAL_TEXT_EMPTY: '文件中没有可读取的文字内容。',
    MATERIAL_NOT_FOUND: '未找到这份学习资料。',
    CONVERSATION_NOT_FOUND: '未找到这段学习对话。',
    ARTIFACT_NOT_FOUND: '未找到这份生成内容。',
    QUIZ_NOT_FOUND: '未找到这份测验。',
    QUIZ_EVIDENCE_INSUFFICIENT: '所选资料的信息不足，暂时无法生成测验。',
    QUIZ_GENERATION_INVALID: '测验生成失败，请重试。',
    QUIZ_ALREADY_SUBMITTED: '这份测验已经提交。',
    AI_PROVIDER_NOT_CONFIGURED: 'AI 服务尚未配置，请联系管理员。',
    AI_PROVIDER_UNAVAILABLE: 'AI 学习助手暂时不可用，请稍后重试。',
    AI_PROVIDER_RESPONSE_INVALID: 'AI 返回内容异常，请重新生成。',
  };

  if (axios.isAxiosError(error) && error.code === 'ERR_NETWORK') {
    return '无法连接服务器，请检查网络后重试。';
  }
  if (axios.isAxiosError<{ error?: { code?: string } }>(error)) {
    const code = error.response?.data.error?.code;
    if (code && localizedMessages[code]) return localizedMessages[code];
  }
  return '暂时无法完成请求，请稍后重试。';
}
