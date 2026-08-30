import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUp, BookOpenText, Check, MessageCircleMore, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { listMaterials } from '../features/materials/api';
import { getConversation, sendStudyMessage } from '../features/study/api';
import { getSafeApiError } from '../services/http';

type ChatMessage = { role: 'user' | 'assistant'; content: string; sources?: string[] };
type StudyMessageInput = Parameters<typeof sendStudyMessage>[0];

const quickActions = [
  { label: '总结核心概念', prompt: '请用简单的语言总结这些资料的核心概念。' },
  { label: '通俗解释', prompt: '请用一个简单的例子解释这些资料中最难理解的概念。' },
  { label: '提取关键词', prompt: '请列出并解释我应该记住的关键词。' },
  { label: '查找考试重点', prompt: '如果要参加考试，我应该重点复习哪些内容？' },
  { label: '生成练习题', prompt: '请给我一道练习题，然后等待我回答。' },
] as const;

export function StudyPage() {
  const [searchParams] = useSearchParams();
  const restoredConversationId = searchParams.get('conversation');
  const requestedMaterialId = searchParams.get('material');
  const materials = useQuery({ queryKey: ['materials'], queryFn: listMaterials });
  const restored = useQuery({
    queryKey: ['conversation', restoredConversationId],
    queryFn: () => getConversation(restoredConversationId ?? ''),
    enabled: Boolean(restoredConversationId),
  });
  const ready = useMemo(() => materials.data?.filter((material) => material.status === 'READY') ?? [], [materials.data]);
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<'en' | 'zh'>('zh');
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [retrievalMode, setRetrievalMode] = useState<'semantic' | 'selected'>('semantic');
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [failedInput, setFailedInput] = useState<StudyMessageInput | null>(null);
  const selectionInitialized = useRef(false);

  useEffect(() => {
    if (selectionInitialized.current || materials.isLoading) return;
    selectionInitialized.current = true;
    const requested = requestedMaterialId && ready.some((material) => material.id === requestedMaterialId)
      ? [requestedMaterialId]
      : ready.map((material) => material.id);
    setSelected(requested);
  }, [materials.isLoading, ready, requestedMaterialId]);

  useEffect(() => {
    if (!restored.data) return;
    setConversationId(restored.data.id);
    setMessages(restored.data.messages.map((message) => ({ role: message.role, content: message.content, sources: message.sources })));
  }, [restored.data]);

  const chat = useMutation({
    mutationFn: (input: StudyMessageInput) => sendStudyMessage(input),
    onSuccess: (answer) => {
      setConversationId(answer.conversationId);
      setMessages((current) => [...current, { role: 'assistant', content: answer.answer, sources: answer.sources }]);
      setError('');
      setFailedInput(null);
    },
    onError: (reason, variables) => {
      setFailedInput(variables);
      setError(getSafeApiError(reason));
    },
  });

  function sendQuestion(content: string, appendUser = true) {
    if (!content || selected.length === 0 || chat.isPending) return;
    const input: StudyMessageInput = {
      question: content,
      materialIds: selected,
      language,
      beginnerMode,
      retrievalMode,
      ...(conversationId ? { conversationId } : {}),
    };
    if (appendUser) setMessages((current) => [...current, { role: 'user', content }]);
    setError('');
    setRetrievalMode('semantic');
    chat.mutate(input);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const content = question.trim();
    if (!content) return;
    setQuestion('');
    sendQuestion(content);
  }

  return (
    <div className="study-layout page-enter">
      <aside className="paper-card source-panel">
        <div><span className="paper-label">资料来源</span><h1>AI 学习</h1><p>仅检索已选中且处理完成的资料。</p></div>
        <div className="source-list">
          {ready.map((material) => {
            const active = selected.includes(material.id);
            return <button className={`source-option${active ? ' source-option--active' : ''}`} type="button" key={material.id} onClick={() => setSelected((current) => active ? current.filter((id) => id !== material.id) : [...current, material.id])}>
              <span>{active ? <Check /> : <BookOpenText />}</span><span><strong>{material.originalName}</strong><small>{material.chunkCount} 个可检索片段</small></span>
            </button>;
          })}
          {!materials.isLoading && ready.length === 0 && <div className="source-empty">还没有处理完成的资料。<Link to="/materials">上传文件</Link></div>}
        </div>
        <div className="study-settings">
          <label>回复语言<select value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'zh')}><option value="zh">中文</option><option value="en">英文</option></select></label>
          <label className="toggle-row"><input type="checkbox" checked={beginnerMode} onChange={(event) => setBeginnerMode(event.target.checked)} /><span><strong>入门模式</strong><small>通俗语言 + 具体示例</small></span></label>
        </div>
      </aside>

      <section className="paper-card chat-panel">
        <header className="chat-panel__header"><span><Sparkles /></span><div><strong>StudyMate 学习导师</strong><small>基于已选择的 {selected.length} 个文件</small></div></header>
        <div className="chat-stream" aria-live="polite">
          {messages.length === 0 && <div className="chat-welcome"><MessageCircleMore /><h2>今天想学习什么？</h2><p>可以让 StudyMate 根据已上传的笔记进行解释、对比、举例，或生成复习问题。</p><div>{quickActions.map((action) => <button type="button" key={action.label} onClick={() => { setQuestion(action.prompt); setRetrievalMode('selected'); }}>{action.label}</button>)}</div></div>}
          {messages.map((message, index) => <article className={`chat-message chat-message--${message.role}`} key={`${message.role}-${index}`}><span>{message.content}</span>{message.sources && message.sources.length > 0 && <footer>资料来源：{message.sources.map((source) => <em key={source}>{source}</em>)}</footer>}</article>)}
          {chat.isPending && <article className="chat-message chat-message--assistant chat-thinking">正在检索学习资料<span>•••</span></article>}
        </div>
        {error && <div className="feature-alert chat-alert" role="alert"><span>{error}</span>{failedInput && <button className="text-button" type="button" disabled={chat.isPending} onClick={() => { setError(''); chat.mutate(failedInput); }}>重试问题</button>}</div>}
        <form className="chat-composer" onSubmit={submit}>
          <textarea aria-label="向 StudyMate 提问" placeholder="针对已选择的资料提出问题…" value={question} onChange={(event) => { setQuestion(event.target.value); if (!event.target.value.trim()) setRetrievalMode('semantic'); }} rows={2} />
          <button type="submit" aria-label="发送问题" disabled={!question.trim() || selected.length === 0 || chat.isPending}><ArrowUp /></button>
        </form>
      </section>
    </div>
  );
}
