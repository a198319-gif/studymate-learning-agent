import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CheckCircle2, FileStack, FileText, MessageCircleMore, Plus, Sparkles, Target, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../features/auth/auth-context';
import { getDashboard } from '../features/dashboard/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const firstName = user?.name.trim().split(/\s+/)[0] || '同学';
  const now = new Date();
  const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  const greeting = now.getHours() < 12 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好';
  const latest = dashboard.data?.recentConversations[0];

  return <div className="dashboard page-enter">
    <section className="welcome-row">
      <div><span className="paper-label">{today}</span><h1>{greeting}，{firstName} <span aria-hidden="true">✦</span></h1><p>你的学习资料、AI 对话、生成内容和测验进度都整理在这里。</p></div>
      <Link className="button button--primary" to="/study"><Plus size={18} aria-hidden="true" />开始新的学习</Link>
    </section>

    {dashboard.isLoading && <section className="paper-card feature-empty">正在加载学习空间…</section>}
    {dashboard.isError && <section className="paper-card feature-empty"><strong>仪表盘加载失败。</strong><button className="text-button" type="button" onClick={() => void dashboard.refetch()}>重试</button></section>}
    {dashboard.data && <>
      <section className="stat-grid" aria-label="学习概览">
        <article className="stat-card stat-card--blue"><span className="stat-card__icon"><FileStack aria-hidden="true" /></span><div><strong>{dashboard.data.materialCount}</strong><span>学习资料</span></div><small>已上传到资料库</small></article>
        <article className="stat-card stat-card--yellow"><span className="stat-card__icon"><MessageCircleMore aria-hidden="true" /></span><div><strong>{dashboard.data.conversationCount}</strong><span>学习对话</span></div><small>已保存的对话记录</small></article>
        <article className="stat-card stat-card--mint"><span className="stat-card__icon"><CheckCircle2 aria-hidden="true" /></span><div><strong>{dashboard.data.quizAccuracy === null ? '—' : `${dashboard.data.quizAccuracy}%`}</strong><span>测验正确率</span></div><small>共 {dashboard.data.practiceQuestionCount} 道练习题</small></article>
      </section>

      <div className="dashboard-grid">
        <section className="paper-card continue-card">
          <div className="section-heading"><div><span className="eyebrow">从上次停下的地方继续</span><h2>继续学习</h2></div><Link className="text-button" to="/history">查看全部 <ArrowRight size={15} /></Link></div>
          {latest ? <Link className="session-card" to={`/study?conversation=${latest.id}`} aria-label={`继续学习 ${latest.title}`}>
            <div className="session-card__art" aria-hidden="true"><BookOpen /><span>{latest.messageCount} 条</span></div>
            <div className="session-card__body"><span className="subject-tag">最近对话</span><h3>{latest.title}</h3><p>{latest.preview || '打开这段对话继续学习。'}</p></div>
            <ArrowRight className="round-action" aria-hidden="true" />
          </Link> : <div className="feature-empty"><MessageCircleMore /><strong>还没有学习对话。</strong><span>围绕资料提出第一个问题，开始学习。</span><Link className="text-button" to="/study">开始 AI 学习</Link></div>}

          <div className="section-heading section-heading--subjects"><div><span className="eyebrow">最近学习</span><h2>学习对话</h2></div></div>
          <div className="subject-list">{dashboard.data.recentConversations.map((conversation) => <Link className="subject-row" to={`/study?conversation=${conversation.id}`} key={conversation.id}><span className="subject-row__pin subject-row__pin--blue" /><div className="subject-row__copy"><strong>{conversation.title}</strong><span>{conversation.messageCount} 条消息 · {new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}</span></div><ArrowRight aria-hidden="true" /></Link>)}</div>
        </section>

        <aside className="dashboard-rail">
          <section className="paper-card exam-card"><div className="section-heading"><div><span className="eyebrow">生成式备考</span><h2>考前复习</h2></div><FileText aria-hidden="true" /></div><div className="exam-card__count"><strong>{String(dashboard.data.examReviewCount).padStart(2, '0')}</strong><span>份已保存</span></div><p>从已处理的学习资料中生成重点复习指南。</p><Link className="button button--ink" to="/exam-review">生成复习指南 <ArrowRight size={16} /></Link></section>
          <section className="quick-actions" aria-label="快捷操作"><Link className="quick-action quick-action--blue" to="/materials"><Upload /><span><strong>上传资料</strong><small>支持 PDF、DOCX、PPTX 或 TXT</small></span></Link><Link className="quick-action quick-action--yellow" to="/study"><Sparkles /><span><strong>向 StudyMate 提问</strong><small>基于你的笔记学习</small></span></Link><Link className="quick-action quick-action--mint" to="/quiz"><Target /><span><strong>快速测验</strong><small>检验知识掌握程度</small></span></Link></section>
          <section className="paper-card recent-card"><div className="section-heading"><div><span className="eyebrow">最近添加</span><h2>学习资料</h2></div></div>{dashboard.data.recentMaterials.length === 0 && <div className="feature-empty"><span>还没有学习资料。</span></div>}{dashboard.data.recentMaterials.map((material) => <Link className="recent-file" to={material.status === 'READY' ? `/study?material=${material.id}` : '/materials'} key={material.id}><span><FileText /></span><div><strong>{material.originalName}</strong><small>{formatBytes(material.size)} · {material.status === 'READY' ? '已就绪' : material.status === 'FAILED' ? '处理失败' : '处理中'}</small></div></Link>)}</section>
        </aside>
      </div>
    </>}
  </div>;
}
