import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ClipboardCheck, FileSearch, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { listMaterials } from '../features/materials/api';
import { generateQuiz, getQuiz, submitQuiz, type Quiz, type QuizQuestion } from '../features/study/api';
import { getSafeApiError } from '../services/http';

const difficultyLabels: Record<Quiz['difficulty'], string> = { EASY: '简单', MEDIUM: '中等', HARD: '困难' };
const questionTypeLabels: Record<QuizQuestion['type'], string> = {
  MULTIPLE_CHOICE: '单项选择题',
  TRUE_FALSE: '判断题',
  SHORT_ANSWER: '简答题',
};

export function QuizPage() {
  const [searchParams] = useSearchParams();
  const restoredQuizId = searchParams.get('id');
  const materials = useQuery({ queryKey: ['materials'], queryFn: listMaterials });
  const restored = useQuery({ queryKey: ['quiz', restoredQuizId], queryFn: () => getQuiz(restoredQuizId ?? ''), enabled: Boolean(restoredQuizId) });
  const ready = useMemo(() => materials.data?.filter((material) => material.status === 'READY') ?? [], [materials.data]);
  const [selected, setSelected] = useState<string[]>([]);
  const [language, setLanguage] = useState<'en' | 'zh'>('zh');
  const [difficulty, setDifficulty] = useState<Quiz['difficulty']>('MEDIUM');
  const [questionCount, setQuestionCount] = useState(10);
  const [questionType, setQuestionType] = useState<'MIXED' | QuizQuestion['type']>('MIXED');
  const [quiz, setQuiz] = useState<Quiz>();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!restored.data) return;
    setQuiz(restored.data);
    setAnswers(Object.fromEntries(restored.data.questions.map((question) => [question.id, question.userAnswer ?? ''])));
  }, [restored.data]);

  const generate = useMutation({
    mutationFn: generateQuiz,
    onSuccess: (result) => { setQuiz(result); setAnswers({}); },
  });
  const submit = useMutation({
    mutationFn: ({ quizId, items }: { quizId: string; items: Array<{ questionId: string; answer: string }> }) => submitQuiz(quizId, items),
    onSuccess: setQuiz,
  });

  function toggleMaterial(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const allAnswered = quiz?.questions.every((question) => (answers[question.id] ?? '').trim()) ?? false;

  if (quiz) return <div className="feature-page page-enter quiz-session">
    <section className="feature-hero"><div><span className="paper-label">主动回忆</span><h1>{quiz.title === 'Practice quiz' ? '练习测验' : quiz.title}</h1><p>{quiz.questionCount} 道题 · {difficultyLabels[quiz.difficulty]} · 基于已选择的学习资料</p></div>{quiz.score !== null && <div className="quiz-score"><Trophy /><strong>{quiz.score}%</strong><span>最终得分</span></div>}</section>
    <div className="quiz-question-list">
      {quiz.questions.map((question, index) => <article className="paper-card quiz-question" key={question.id}>
        <header><span>{String(index + 1).padStart(2, '0')}</span><div><small>{questionTypeLabels[question.type]}</small><h2>{question.question}</h2></div></header>
        {question.options ? <div className="quiz-options">{question.options.map((option) => <label className={answers[question.id] === option ? 'quiz-option quiz-option--selected' : 'quiz-option'} key={option}><input type="radio" name={question.id} value={option} disabled={quiz.score !== null} checked={(answers[question.id] ?? question.userAnswer) === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} /><span>{option}</span></label>)}</div> : <label className="quiz-short"><span>你的答案</span><textarea rows={3} disabled={quiz.score !== null} value={answers[question.id] ?? question.userAnswer ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} /></label>}
        {quiz.score !== null && <div className="quiz-explanation"><strong>正确答案：{question.correctAnswer}</strong><p>{question.explanation}</p><small>资料来源：{question.sourceReference}</small></div>}
      </article>)}
    </div>
    <div className="quiz-actions">{quiz.score === null ? <button className="button button--primary" type="button" disabled={!allAnswered || submit.isPending} onClick={() => submit.mutate({ quizId: quiz.id, items: quiz.questions.map((question) => ({ questionId: question.id, answer: answers[question.id] ?? '' })) })}>{submit.isPending ? '正在评分…' : '提交全部答案'}</button> : <button className="button button--primary" type="button" onClick={() => setQuiz(undefined)}><RotateCcw />再生成一份测验</button>}</div>
    {(generate.isError || submit.isError) && <div className="feature-alert">{getSafeApiError(generate.error ?? submit.error)}</div>}
  </div>;

  return <div className="feature-page page-enter">
    <section className="feature-hero"><div><span className="paper-label">主动回忆</span><h1>练习测验</h1><p>生成结构化测验，在没有提示的情况下作答，提交后查看得分和基于资料的解析。</p></div></section>
    <div className="generator-grid">
      <section className="paper-card generator-form"><span className="generator-icon"><ClipboardCheck /></span><h2>测验设置</h2><p>选择处理完成的资料，并设置题目难度。</p>
        <div className="generator-sources">{ready.map((material) => <button className={selected.includes(material.id) ? 'generator-source generator-source--active' : 'generator-source'} type="button" key={material.id} onClick={() => toggleMaterial(material.id)}><span>{selected.includes(material.id) ? <Check /> : <FileSearch />}</span><strong>{material.originalName}</strong></button>)}{!materials.isLoading && ready.length === 0 && <div className="source-empty">还没有处理完成的资料。<Link to="/materials">上传文件</Link></div>}</div>
        <div className="quiz-settings"><label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Quiz['difficulty'])}><option value="EASY">简单</option><option value="MEDIUM">中等</option><option value="HARD">困难</option></select></label><label>题目数量<select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{[5, 10, 15, 20].map((count) => <option value={count} key={count}>{count}</option>)}</select></label><label>题型<select aria-label="题型" value={questionType} onChange={(event) => setQuestionType(event.target.value as typeof questionType)}><option value="MIXED">混合题型</option><option value="MULTIPLE_CHOICE">单项选择题</option><option value="TRUE_FALSE">判断题</option><option value="SHORT_ANSWER">简答题</option></select></label><label>输出语言<select value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'zh')}><option value="zh">中文</option><option value="en">英文</option></select></label></div>
        <button className="button button--primary generator-submit" type="button" disabled={selected.length === 0 || generate.isPending} onClick={() => generate.mutate({ materialIds: selected, language, difficulty, questionCount, questionTypes: questionType === 'MIXED' ? ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'] : [questionType] })}>{generate.isPending ? '正在生成测验…' : '生成练习测验'}</button>
        {generate.isError && <div className="feature-alert">{getSafeApiError(generate.error)}</div>}
      </section>
      <section className="paper-card artifact-paper"><div className="artifact-empty"><ClipboardCheck /><h2>题目将在这里显示</h2><p>提交全部答案前，正确答案将保持隐藏。</p></div></section>
    </div>
  </div>;
}
