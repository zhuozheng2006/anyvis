/** Keep body-mounted Blockly popups owned by the workspace, below app dialogs. */
export function guardWorkspacePopups(host: HTMLElement, closePopups: () => void) {
  const externalDialog = () => Array.from(document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], dialog[open]',
  )).find(dialog => {
    if (dialog.closest('.blocklyWidgetDiv, .blocklyDropDownDiv, [hidden], [inert]')) return false;
    if (dialog instanceof HTMLDialogElement && !dialog.open) return false;
    for (let element: HTMLElement | null = dialog; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  });
  let active: HTMLElement | undefined;
  const sync = () => {
    const dialog = externalDialog();
    if (dialog && dialog !== active) {
      // Closing Blockly widgets may restore workspace focus. Keep the dialog's
      // initial focus, which React has already placed before this observer runs.
      const focused = document.activeElement;
      active = dialog;
      closePopups();
      if (focused instanceof HTMLElement && dialog.contains(focused)) focused.focus();
    }
    active = dialog;
  };
  const blockBackground = (event: Event) => {
    if (!externalDialog()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['open', 'hidden', 'role', 'aria-modal'] });
  // Blockly opens its context menu on pointerdown, before contextmenu fires.
  host.addEventListener('pointerdown', blockBackground, true);
  host.addEventListener('contextmenu', blockBackground, true);
  sync();
  return () => {
    observer.disconnect();
    host.removeEventListener('pointerdown', blockBackground, true);
    host.removeEventListener('contextmenu', blockBackground, true);
  };
}
