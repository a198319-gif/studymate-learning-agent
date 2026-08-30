import { BrainCircuit, CheckCircle2, LibraryBig } from 'lucide-react';
import { Outlet } from 'react-router-dom';

import { Brand } from '../components/Brand';

export function PublicLayout() {
  return (
    <main className="public-layout">
      <section className="public-story" aria-label="StudyMate 产品介绍">
        <Brand />
        <div className="public-story__content">
          <span className="paper-label">更聪明的学习桌面</span>
          <h1>把课堂资料，变成看得见的学习进步。</h1>
          <p>
            上传正在学习的内容，StudyMate 帮你理解、总结并练习，所有环节都在一个专注的学习空间里完成。
          </p>
          <div className="feature-notes">
            <div><LibraryBig aria-hidden="true" /><span>学习资料集中整理</span></div>
            <div><BrainCircuit aria-hidden="true" /><span>回答有据可查，来源于你的笔记</span></div>
            <div><CheckCircle2 aria-hidden="true" /><span>围绕学习目标灵活练习</span></div>
          </div>
        </div>
        <p className="public-story__quote">“每次学一点，持续向前走。”</p>
      </section>
      <section className="auth-stage">
        <div className="auth-stage__mobile-brand"><Brand /></div>
        <div className="auth-paper">
          <Outlet />
        </div>
      </section>
    </main>
  );
}
