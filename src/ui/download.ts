/**
 * Save text as a file through the browser's download, from a local object URL.
 * Nothing is sent anywhere; the app keeps no copy.
 */
export function downloadText(name: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
