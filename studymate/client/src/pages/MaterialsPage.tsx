import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, LoaderCircle, Search, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';
import { deleteMaterial, listMaterials, uploadMaterial, type Material } from '../features/materials/api';
import { getSafeApiError } from '../services/http';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const allowedExtensions = new Set(['pdf', 'docx', 'pptx', 'txt']);

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Status({ material }: { material: Material }) {
  if (material.status === 'READY') return <span className="status-chip status-chip--ready"><CheckCircle2 />已就绪 · {material.chunkCount} 个片段</span>;
  if (material.status === 'FAILED') return <span className="status-chip status-chip--failed"><XCircle />处理失败</span>;
  return <span className="status-chip status-chip--processing"><LoaderCircle className="spin" />处理中</span>;
}

export function MaterialsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [toast, setToast] = useState('');
  const materials = useQuery({
    queryKey: ['materials'],
    queryFn: listMaterials,
    refetchInterval: (query) => query.state.data?.some((material) => material.status === 'PROCESSING') ? 2_000 : false,
  });
  const upload = useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress: (percent: number) => void }) => uploadMaterial(file, onProgress),
    onSuccess: async () => {
      setError('');
      setUploadProgress(100);
      setToast('资料上传成功，系统已开始处理。');
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (reason) => { setUploadProgress(null); setError(getSafeApiError(reason)); },
  });
  const remove = useMutation({
    mutationFn: (materialId: string) => deleteMaterial(materialId),
    onSuccess: async () => {
      setDeleteTarget(null);
      setToast('资料已删除。');
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (reason) => setError(getSafeApiError(reason)),
  });

  function chooseFile(file: File | undefined) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!allowedExtensions.has(extension)) return setError('请选择 PDF、DOCX、PPTX 或 TXT 文件。');
    if (file.size > MAX_FILE_BYTES) return setError('文件大小不能超过 25 MB。');
    setError('');
    setUploadProgress(0);
    upload.mutate({ file, onProgress: setUploadProgress });
  }

  const filteredMaterials = (materials.data ?? []).filter((material) => {
    const matchesSearch = material.originalName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const matchesStatus = statusFilter === 'ALL' || material.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || material.extension.toUpperCase() === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="feature-page page-enter">
      <section className="feature-hero">
        <div><span className="paper-label">你的知识库</span><h1>学习资料</h1><p>上传课堂笔记和阅读材料，StudyMate 的每个回答都会以这些文件为依据。</p></div>
        <Link className="button button--primary" to="/study">基于资料提问</Link>
      </section>

      <button
        className="upload-dropzone"
        type="button"
        aria-label="拖放新的学习文件"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}
        disabled={upload.isPending}
      >
        <span className="upload-dropzone__icon"><UploadCloud /></span>
        <strong>{upload.isPending ? '正在上传学习资料…' : '拖放或点击上传学习文件'}</strong>
        <span>支持 PDF、DOCX、PPTX 或 TXT · 最大 25 MB</span>
        <input ref={inputRef} type="file" hidden accept=".pdf,.docx,.pptx,.txt" onChange={(event) => chooseFile(event.target.files?.[0])} />
      </button>
      {uploadProgress !== null && <div className="upload-progress">
        <progress value={uploadProgress} max={100} aria-label="上传进度" aria-valuenow={uploadProgress} />
        <span>已上传 {uploadProgress}%</span>
      </div>}
      {error && <div className="feature-alert" role="alert">{error}</div>}

      <section className="paper-card library-card">
        <div className="section-heading"><div><span className="eyebrow">归档并建立索引</span><h2>资料库</h2></div><span className="library-count">{materials.data?.length ?? 0} 个文件</span></div>
        <div className="library-filters">
          <label className="library-search"><Search aria-hidden="true" /><input type="search" aria-label="搜索资料" placeholder="搜索文件名…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span>状态</span><select aria-label="状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">全部状态</option><option value="READY">已就绪</option><option value="PROCESSING">处理中</option><option value="FAILED">处理失败</option></select></label>
          <label><span>类型</span><select aria-label="文件类型筛选" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">全部类型</option><option value="PDF">PDF</option><option value="DOCX">DOCX</option><option value="PPTX">PPTX</option><option value="TXT">TXT</option></select></label>
        </div>
        {materials.isLoading && <div className="feature-empty">正在加载学习资料…</div>}
        {materials.isError && <div className="feature-empty">学习资料加载失败。<button className="text-button" onClick={() => void materials.refetch()}>重试</button></div>}
        {materials.data?.length === 0 && <div className="feature-empty"><FileText /><strong>资料库正在等待你的第一份文件。</strong><span>上传笔记后，即可开始基于资料的学习。</span></div>}
        {materials.data && materials.data.length > 0 && filteredMaterials.length === 0 && <div className="feature-empty"><Search /><strong>没有符合筛选条件的资料。</strong><span>请尝试其他文件名、状态或文件类型。</span></div>}
        <div className="material-list">
          {filteredMaterials.map((material) => (
            <article className="material-row" key={material.id}>
              <span className={`file-badge file-badge--${material.extension}`}>{material.extension.toUpperCase()}</span>
              <div className="material-row__copy"><strong>{material.originalName}</strong><span>{formatBytes(material.size)} · 添加于 {new Date(material.createdAt).toLocaleDateString('zh-CN')}</span><Status material={material} /></div>
              <div className="material-row__actions">
                {material.status === 'READY' && <Link className="text-button" aria-label={`学习 ${material.originalName}`} to={`/study?material=${material.id}`}>学习</Link>}
                <button className="icon-button material-delete" type="button" aria-label={`删除 ${material.originalName}`} onClick={() => setDeleteTarget(material)}><Trash2 /></button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除 ${deleteTarget?.originalName ?? '这份资料'}？`}
        description="该文件及其索引将被永久删除，后续学习也无法再访问。此操作无法撤销。"
        confirmLabel="删除"
        busy={remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) remove.mutate(deleteTarget.id); }}
      />
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}
