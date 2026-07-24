/**
 * Converte os nomes livres escritos nos blocos em identificadores C++.
 *
 * Todos os nomes do usuário vivem no namespace `bloquin_user_`, separado
 * ainda entre variáveis e funções. Além de impedir colisões com palavras do
 * C++ e com setup/loop/main, isso mantém distintos casos como `int` e
 * `bloquin_int`, bem como uma variável e uma função chamadas `foo`. A
 * auditoria usa exatamente a mesma função para detectar apenas as colisões
 * que também ocorreriam no código gerado.
 */
export function toCppIdentifier(
  value: unknown,
  fallback: string,
  namespace: 'var' | 'fn',
): string {
  const source = String(value ?? '').trim() || fallback;
  const normalized = source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || fallback;

  return `bloquin_user_${namespace}_${normalized}`;
}
