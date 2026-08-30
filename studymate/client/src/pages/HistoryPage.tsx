import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Clock3, FileClock, MessageCircleMore, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listConversations, listQuizzes, listStudyHistory } from '../features/study/api';

const artifactLabels = {
  SUMMARY: '智能总结',
  KEY_POINTS: '重点提炼',
  QUIZ: '练习测验',
  EXAM_REVIEW: '考前复习',
} as const;

const difficultyLabels = { EASY: '简单', MEDIUM: '中等', HARD: '困难' } as const;
const stockArtifactTitles: Record<string, string> = {
  'Smart summary': '智能总结',
  'Key points': '重点提炼',
  'Practice quiz': '练习测验',
  'Exam review guide': '考前复习',
};

export function HistoryPage() {
  const artifacts = useQuery({ queryKey: ['study-history'], queryFn: listStudyHistory });
  const conversations = useInfiniteQuery({
    queryKey: ['conversation-history'],
    queryFn: ({ pageParam }) => listConversations(pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const quizzes = useQuery({ queryKey: ['quiz-history'], queryFn: listQuizzes });
  const conversationItems = conversations.data?.pages.flatMap((page) => page.conversations) ?? [];
  const empty = artifacts.data?.length === 0 && conversationItems.length === 0 && quizzes.data?.length === 0;
  const failed = artifacts.isError || conversations.isError || quizzes.isError;
  const loading = artifacts.isLoading || conversations.isLoading || quizzes.isLoading;

  return <div className="feature-page page-enter">
    <section className="feature-hero"><div><span className="paper-label">你的学习轨迹</span><h1>学习记录</h1><p>继续过往对话、查看测验成绩，或重新打开已经生成的学习内容。</p></div></section>
    {loading && <section className="paper-card history-card"><div className="feature-empty">正在加载学习记录…</div></section>}
    {failed && <section className="paper-card history-card"><div className="feature-empty">完整学习记录加载失败。</div></section>}
    {empty && <section className="paper-card history-card"><div className="feature-empty"><FileClock /><strong>还没有学习记录。</strong><span>你的第一次对话、总结或测验会保存在这里。</span></div></section>}
    {conversationItems.length > 0 && <section className="paper-card history-card history-section"><div className="section-heading"><div><span className="eyebrow">继续对话</span><h2>学习对话</h2></div></div>{conversationItems.map((conversation) => <Link className="conversation-history" to={`/study?conversation=${conversation.id}`} key={conversation.id}><span><MessageCircleMore /></span><div><strong>{conversation.title}</strong><p>{conversation.preview}</p><small><Clock3 />{new Date(conversation.updatedAt).toLocaleString('zh-CN')} · {conversation.messageCount} 条消息</small></div></Link>)}{conversations.hasNextPage && <button className="text-button history-more" type="button" onClick={() => void conversations.fetchNextPage()} disabled={conversations.isFetchingNextPage}>{conversations.isFetchingNextPage ? '正在加载…' : '加载更早的对话'}</button>}</section>}
    {quizzes.data && quizzes.data.length > 0 && <section className="paper-card history-card history-section"><div className="section-heading"><div><span className="eyebrow">练习记录</span><h2>测验</h2></div></div>{quizzes.data.map((quiz) => <Link className="quiz-history" to={`/quiz?id=${quiz.id}`} key={quiz.id}><span><Trophy /></span><div><strong>{quiz.title === 'Practice quiz' ? '练习测验' : quiz.title}</strong><small>{difficultyLabels[quiz.difficulty]} · {quiz.questionCount} 道题 · {new Date(quiz.createdAt).toLocaleDateString('zh-CN')}</small></div><b>{quiz.score === null ? '未提交' : `${quiz.score}%`}</b></Link>)}</section>}
    {artifacts.data && artifacts.data.length > 0 && <section className="paper-card history-card history-section"><div className="section-heading"><div><span className="eyebrow">已保存的学习内容</span><h2>生成内容</h2></div></div>{artifacts.data.map((artifact) => <Link className="history-item history-artifact-link" to={`/artifacts/${artifact.id}`} key={artifact.id}><span className={`history-type history-type--${artifact.type.toLowerCase()}`}>{artifactLabels[artifact.type]}</span><span><strong>{stockArtifactTitles[artifact.title] ?? artifact.title}</strong><small><Clock3 />{new Date(artifact.createdAt).toLocaleString('zh-CN')}</small></span></Link>)}</section>}
  </div>;
}
