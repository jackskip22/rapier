for (const block of document.querySelectorAll('.code')) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'copy'; button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(block.querySelector('pre').innerText); button.textContent = 'Copied'; }
    catch (_) { const range = document.createRange(); range.selectNodeContents(block.querySelector('pre')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); button.textContent = 'Selected'; }
    setTimeout(() => { button.textContent = 'Copy'; }, 1500);
  });
  block.append(button);
}
