import { useMutation, useQuery } from '@tanstack/react-query';
import { BookCheck, Check, ClipboardCheck, Copy, FileSearch, NotebookPen, RefreshCw, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Toast } from '../components/Toast';
import { listMaterials } from '../features/materials/api';
import { generateStudyArtifact, type GeneratedArtifact, type GenerationType } from '../features/study/api';
import { getSafeApiError } from '../services/http';

const configuration: Record<GenerationType, { eyebrow: string; title: string; description: string; action: string; icon: typeof Sparkles }> = {
  SUMMARY: { eyebrow: '把握全局', title: '智能总结', description: '将选中的笔记整理成清晰、连贯的知识讲解。', action: '生成总结', icon: NotebookPen },
  KEY_POINTS: { eyebrow: '聚焦重要内容', title: '重点提炼', description: '提取值得记忆的事实、概念和知识关联。', action: '提炼重点', icon: Sparkles },
  QUIZ: { eyebrow: '主动回忆', title: '练习测验', description: '根据资料生成题目、答案和解析，用于自我检测。', action: '生成练习测验', icon: ClipboardCheck },
  EXAM_REVIEW: { eyebrow: '专注备考', title: '考前复习', description: '生成包含核心概念、易错点和复习清单的备考指南。', action: '生成复习指南', icon: BookCheck },
};

export function StudyToolPage({ type }: { type: GenerationType }) {
  const config = configuration[type];
  const Icon = config.icon;
  const materials = useQuery({ queryKey: ['materials'], queryFn: listMaterials });
  const ready = useMemo(() => materials.data?.filter((material) => material.status === 'READY') ?? [], [materials.data]);
  const [selected, setSelected] = useState<string[]>([]);
  const [language, setLanguage] = useState<'en' | 'zh'>('zh');
  const [artifact, setArtifact] = useState<GeneratedArtifact>();
  const [lastInput, setLastInput] = useState<Parameters<typeof generateStudyArtifact>[0]>();
  const [toast, setToast] = useState('');
  const generate = useMutation({ mutationFn: (input: Parameters<typeof generateStudyArtifact>[0]) => generateStudyArtifact(input), onSuccess: setArtifact });

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function runGeneration() {
    const input = { type, materialIds: selected, language };
    setLastInput(input);
    generate.mutate(input);
  }

  async function copyResult() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.text);
      setToast('结果已复制到剪贴板。');
    } catch {
      setToast('浏览器阻止了复制操作。');
    }
  }

  return <div className="feature-page page-enter">
    <section className="feature-hero"><div><span className="paper-label">{config.eyebrow}</span><h1>{config.title}</h1><p>{config.description}</p></div></section>
    <div className="generator-grid">
      <section className="paper-card generator-form">
        <span className="generator-icon"><Icon /></span><h2>选择资料来源</h2><p>StudyMate 只会使用你在这里选择且处理完成的文件。</p>
        <div className="generator-sources">
          {ready.map((material) => <button className={selected.includes(material.id) ? 'generator-source generator-source--active' : 'generator-source'} type="button" key={material.id} onClick={() => toggle(material.id)}><span>{selected.includes(material.id) ? <Check /> : <FileSearch />}</span><strong>{material.originalName}</strong></button>)}
          {!materials.isLoading && ready.length === 0 && <div className="source-empty">还没有处理完成的资料。<Link to="/materials">上传文件</Link></div>}
        </div>
        <label className="generator-language">输出语言<select value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'zh')}><option value="zh">中文</option><option value="en">英文</option></select></label>
        <button className="button button--primary generator-submit" type="button" disabled={selected.length === 0 || generate.isPending} onClick={runGeneration}>{generate.isPending ? '正在检索并生成…' : config.action}</button>
        {generate.isError && <div className="feature-alert" role="alert">{getSafeApiError(generate.error)}</div>}
      </section>
      <section className="paper-card artifact-paper">
        {!artifact && <div className="artifact-empty"><Icon /><h2>生成结果将在这里显示</h2><p>选择一个或多个已处理文件，然后生成有资料依据的学习内容。</p></div>}
        {artifact && <article><div className="artifact-heading"><div><span className="eyebrow">根据你的资料库生成</span><h2>{config.title}</h2></div><div className="artifact-actions"><button className="button button--secondary" type="button" onClick={() => void copyResult()}><Copy aria-hidden="true" />复制结果</button><button className="button button--secondary" type="button" disabled={generate.isPending || !lastInput} onClick={() => { if (lastInput) generate.mutate(lastInput); }}><RefreshCw aria-hidden="true" />重新生成</button></div></div><div className="artifact-text">{artifact.text}</div>{artifact.sources.length > 0 && <footer>资料来源 {artifact.sources.map((source) => <em key={source}>{source}</em>)}</footer>}</article>}
      </section>
    </div>
    {toast && <Toast message={toast} onClose={() => setToast('')} />}
  </div>;
}
