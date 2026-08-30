import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Toast } from '../components/Toast';
import { getStudyArtifact } from '../features/study/api';

const artifactLabels = {
  SUMMARY: '智能总结',
  KEY_POINTS: '重点提炼',
  QUIZ: '练习测验',
  EXAM_REVIEW: '考前复习',
} as const;
const stockArtifactTitles: Record<string, string> = {
  'Smart summary': '智能总结',
  'Key points': '重点提炼',
  'Practice quiz': '练习测验',
  'Exam review guide': '考前复习',
};

export function ArtifactPage() {
  const { id = '' } = useParams();
  const [toast, setToast] = useState('');
  const artifact = useQuery({ queryKey: ['study-artifact', id], queryFn: () => getStudyArtifact(id), enabled: Boolean(id) });

  if (artifact.isLoading) return <div className="feature-empty">正在加载已保存的学习内容…</div>;
  if (artifact.isError || !artifact.data) return <div className="paper-card feature-empty"><FileText /><strong>无法打开这份学习内容。</strong><button className="text-button" type="button" onClick={() => void artifact.refetch()}>重试</button><Link className="text-button" to="/history">返回学习记录</Link></div>;

  return <div className="feature-page page-enter">
    <Link className="artifact-back" to="/history"><ArrowLeft aria-hidden="true" />返回学习记录</Link>
    <section className="paper-card artifact-paper artifact-page">
      <article>
        <div className="artifact-heading"><div><span className="paper-label">{artifactLabels[artifact.data.type]}</span><h1>{stockArtifactTitles[artifact.data.title] ?? artifact.data.title}</h1><p>{new Date(artifact.data.createdAt).toLocaleString('zh-CN')}</p></div><button className="button button--secondary" type="button" onClick={() => void navigator.clipboard.writeText(artifact.data.text).then(() => setToast('结果已复制到剪贴板。'), () => setToast('浏览器阻止了复制操作。'))}><Copy aria-hidden="true" />复制结果</button></div>
        <div className="artifact-text">{artifact.data.text}</div>
        {artifact.data.sources.length > 0 && <footer>资料来源 {artifact.data.sources.map((source) => <em key={source}>{source}</em>)}</footer>}
      </article>
    </section>
    {toast && <Toast message={toast} onClose={() => setToast('')} />}
  </div>;
}
