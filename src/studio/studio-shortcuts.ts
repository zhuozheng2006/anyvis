export function isComposingShortcut(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229;
}

function eventElement(event: KeyboardEvent) {
  return event.target instanceof Element ? event.target : document.activeElement;
}

export function isTextEditingShortcut(event: KeyboardEvent) {
  const target = eventElement(event);
  return Boolean(target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], .cm-editor'));
}

const DIALOG = '[role="dialog"], [role="alertdialog"]';
const INTERACTIVE_CONTROL = 'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="slider"], [role="checkbox"], [role="switch"]';

export function canUseWorkspaceShortcut(event: KeyboardEvent) {
  return !event.defaultPrevented && !isComposingShortcut(event) && !isTextEditingShortcut(event) && !document.querySelector(DIALOG);
}

/** Space activates buttons/tabs/custom triggers, so leave Space to those focused controls. */
export function canUsePlaybackSpaceShortcut(event: KeyboardEvent) {
  return canUseWorkspaceShortcut(event) && !eventElement(event)?.closest(INTERACTIVE_CONTROL);
}

interface ProjectShortcutActions {
  save(): void;
  render(): void;
  undo(): void;
  redo(): void;
  togglePalette(): void;
  closeStudioDialog(): void;
}

export function handleProjectShortcut(event: KeyboardEvent, actions: ProjectShortcutActions) {
  if (event.defaultPrevented || isComposingShortcut(event) || event.altKey) return;
  const key = event.key.toLowerCase();
  const command = event.metaKey || event.ctrlKey;
  if (document.querySelector(DIALOG)) {
    const owner = eventElement(event)?.closest(DIALOG);
    // Only the dialog itself may close; nested editors keep their own shortcuts.
    if (key === 'escape' && owner?.classList.contains('studio-modal')) {
      event.preventDefault(); actions.closeStudioDialog();
    } else if (command && key === 'k' && owner?.classList.contains('cmd-palette-dialog')) {
      event.preventDefault(); actions.togglePalette();
    }
    return;
  }
  if (!command) return;
  if (key === 'k') { event.preventDefault(); actions.togglePalette(); }
  else if (key === 's') { event.preventDefault(); actions.save(); }
  else if (key === 'enter') { event.preventDefault(); actions.render(); }
  else if (key === 'z' && !isTextEditingShortcut(event)) {
    event.preventDefault(); event.stopPropagation();
    if (event.shiftKey) actions.redo(); else actions.undo();
  }
}
