/** Wait through Blockly's animation-frame + timer event dispatch, without a
 * fixed delay that races the frame scheduler on slower CI machines. */
export function flushBlocklyEvents(): Promise<void> {
  return new Promise(resolve => {
    const afterFrame = () => { setTimeout(resolve, 0); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(afterFrame);
    else afterFrame();
  });
}
