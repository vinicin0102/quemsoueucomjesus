/** Validacao dos dados do comprador, no servidor. */

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Validacao real de CPF (digitos verificadores), nao so o tamanho. */
function cpfValido(cpf) {
  const c = soDigitos(cpf);
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(c[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(c[10]);
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

/**
 * Retorna { ok: true, customer } ou { ok: false, erros: [...] }.
 */
function validarCliente(body) {
  const erros = [];

  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const document = soDigitos(body?.document);
  const phone = soDigitos(body?.phone);

  if (name.length < 3 || !name.includes(' ')) erros.push('Informe seu nome completo.');
  if (!emailValido(email)) erros.push('E-mail invalido.');
  if (!cpfValido(document)) erros.push('CPF invalido.');
  if (phone.length < 10 || phone.length > 11) erros.push('Telefone invalido (DDD + numero).');

  if (erros.length) return { ok: false, erros };

  return {
    ok: true,
    customer: { name, email, document, phone_number: phone }
  };
}

module.exports = { validarCliente, cpfValido, emailValido, soDigitos };
