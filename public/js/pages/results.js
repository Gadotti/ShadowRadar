export function render(container) {
  container.innerHTML = `
    <div class="page-header"><h1 class="page-title">Resultados CVE</h1></div>
    <div class="empty-state">
      <div class="empty-state-icon">⚑</div>
      <div class="empty-state-title">Resultados de Vulnerabilidades</div>
      <p class="empty-state-text">Implementado na TASK-07.</p>
    </div>
  `;
}
