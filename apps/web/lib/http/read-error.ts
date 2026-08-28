export interface ReadErrorPresentation {
  message: string;
  title: string;
  tone: 'error' | 'warning';
}

/**
 * Map a failed read to a safe, Spanish presentation.
 *
 * `requiredPermission` only names the permission the surface needs, so a 403
 * tells the user which grant is missing instead of a generic refusal. It never
 * changes what the caller may see: authorization is decided by the API.
 */
export function presentReadError(
  error: unknown,
  requiredPermission = 'inventory.read',
): ReadErrorPresentation {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? error.status
      : undefined;
  if (typeof status === 'number') {
    if (status === 401) {
      return {
        message: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
        title: 'Sesión expirada',
        tone: 'warning',
      };
    }
    if (status === 403) {
      return {
        message: `Tu cuenta no tiene el permiso ${requiredPermission} requerido para esta consulta.`,
        title: 'Sin permiso de lectura',
        tone: 'warning',
      };
    }
    if (status === 404) {
      return {
        message: 'El recurso solicitado no existe o ya no está disponible.',
        title: 'No encontrado',
        tone: 'warning',
      };
    }
  }
  return {
    message:
      'No fue posible consultar la información. Intenta nuevamente sin cambiar los datos.',
    title: 'Error de consulta',
    tone: 'error',
  };
}
