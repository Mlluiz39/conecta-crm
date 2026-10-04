import { AgentPerformance, Contact } from '../types/crm';

export function exportAgentPerformanceToCSV(agents: AgentPerformance[]): void {
  const headers = ['Atendente', 'Função', 'Tipo', 'Conversas Atendidas', 'Tempo Médio (TMR)', 'Leads Convertidos', 'Taxa Conversão (%)', 'Receita Gerada (R$)'];
  const rows = agents.map(a => [
    `"${a.name}"`,
    `"${a.role}"`,
    a.isAi ? '"Agente IA"' : '"Humano"',
    a.conversationsHandled,
    `"${a.avgResponseTime}"`,
    a.convertedLeads,
    a.conversionRate.toFixed(1),
    a.revenueGenerated.toFixed(2),
  ]);

  const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  downloadBlob(csvContent, 'relatorio_performance_atendentes.csv', 'text/csv;charset=utf-8;');
}

export function exportContactsToCSV(contacts: Contact[]): void {
  const headers = ['Nome', 'Cargo', 'Empresa', 'Telefone', 'E-mail', 'Cidade', 'UF', 'Canal', 'Etiquetas', 'Valor Oportunidade (R$)', 'Responsável', 'Data Cadastro'];
  const rows = contacts.map(c => [
    `"${c.name}"`,
    `"${c.role || ''}"`,
    `"${c.company}"`,
    `"${c.phone}"`,
    `"${c.email}"`,
    `"${c.city || ''}"`,
    `"${c.state || ''}"`,
    `"${c.channel.toUpperCase()}"`,
    `"${c.tags.join(', ')}"`,
    c.opportunityValue.toFixed(2),
    `"${c.assignedTo}"`,
    `"${c.createdAt}"`,
  ]);

  const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  downloadBlob(csvContent, 'contatos_conectacrm.csv', 'text/csv;charset=utf-8;');
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType }); // \uFEFF for Excel UTF-8 compatibility
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
