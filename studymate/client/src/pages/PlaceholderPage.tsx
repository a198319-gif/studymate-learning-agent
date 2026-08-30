type PlaceholderPageProps = { title: string; eyebrow: string };

export function PlaceholderPage({ title, eyebrow }: PlaceholderPageProps) {
  return (
    <section className="empty-page page-enter">
      <span className="paper-label">{eyebrow}</span>
      <h1>{title}</h1>
      <p>这个学习空间已准备好迎接 StudyMate 的下一项功能。</p>
    </section>
  );
}
