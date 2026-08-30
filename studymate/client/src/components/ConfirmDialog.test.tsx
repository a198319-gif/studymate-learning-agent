import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

function Fixture({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open delete</button>
    <ConfirmDialog open={open} title="Delete notes.pdf?" description="This cannot be undone." confirmLabel="Delete" onCancel={() => setOpen(false)} onConfirm={onConfirm} />
  </>;
}

describe('ConfirmDialog', () => {
  it('focuses Cancel, closes on Escape, and restores trigger focus', async () => {
    const onConfirm = vi.fn();
    render(<Fixture onConfirm={onConfirm} />);
    const trigger = screen.getByRole('button', { name: 'Open delete' });
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
