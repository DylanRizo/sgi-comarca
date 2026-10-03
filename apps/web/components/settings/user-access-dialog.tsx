'use client';

import {
  administratorOnlyPermissionCodes,
  administratorRoleCode,
  panelAccessPermissionCodes,
  type PermissionSummary,
  type RoleSummary,
  type UserDetail,
  type UserDirectoryEntry,
  type UserPermissionOverride,
} from '@sgi/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { userAdminApi } from '@/lib/http/user-admin-api';
import { useModalDialog } from '@/lib/use-modal-dialog';
import { useAuth } from '@/providers/auth-provider';

type Exception = 'NONE' | UserPermissionOverride['effect'];

const restrictedGrants = new Set<string>(administratorOnlyPermissionCodes);
const protectedFromDeny = new Set<string>(panelAccessPermissionCodes);

const exceptionLabels: Record<Exception, string> = {
  DENY: 'Denegar',
  GRANT: 'Conceder',
  NONE: 'Según roles',
};

function overridesOf(detail: UserDetail): Map<string, Exception> {
  return new Map(detail.overrides.map(({ code, effect }) => [code, effect]));
}

function sameSet(left: Iterable<string>, right: Iterable<string>): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Roles and exceptions of one person (ADR-020). Each section saves on its own
 * and sends the complete desired set, which the API applies as a replacement;
 * the table previews the result from the role catalog, and after saving it
 * shows the effective permissions the database computed instead.
 *
 * The controls the API would refuse are disabled here with the reason beside
 * them, but the API remains the authority: ADMIN is never assigned or removed,
 * administrator-only permissions are granted only to the administrator, and
 * the administrator is never denied access to this panel.
 */
export function UserAccessDialog({
  entry,
  onClose,
}: Readonly<{
  entry: UserDirectoryEntry;
  onClose: (changed: boolean) => void;
}>) {
  const { getCsrfToken } = useAuth();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [roles, setRoles] = useState<readonly RoleSummary[]>([]);
  const [permissions, setPermissions] = useState<readonly PermissionSummary[]>(
    [],
  );
  const [loadError, setLoadError] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<readonly string[]>([]);
  const [exceptions, setExceptions] = useState<Map<string, Exception>>(
    () => new Map(),
  );
  const [busy, setBusy] = useState<'' | 'roles' | 'overrides'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const changedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      userAdminApi.detail(entry.id, controller.signal),
      userAdminApi.roles(controller.signal),
      userAdminApi.permissions(controller.signal),
    ])
      .then(([loadedDetail, loadedRoles, loadedPermissions]) => {
        if (controller.signal.aborted) return;
        setDetail(loadedDetail);
        setRoles(loadedRoles);
        setPermissions(loadedPermissions);
        setSelectedRoles(loadedDetail.roles);
        setExceptions(overridesOf(loadedDetail));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError('No pudimos cargar los accesos de esta persona.');
      });
    return () => controller.abort();
  }, [entry.id]);

  const isAdministrator =
    detail?.roles.includes(administratorRoleCode) ?? false;

  const grantedByRoles = useMemo(() => {
    const codes = new Set<string>();
    for (const role of roles) {
      if (selectedRoles.includes(role.code)) {
        for (const code of role.permissions) codes.add(code);
      }
    }
    return codes;
  }, [roles, selectedRoles]);

  const rolesDirty = detail !== null && !sameSet(selectedRoles, detail.roles);
  const desiredOverrides: UserPermissionOverride[] = [...exceptions.entries()]
    .filter((pair): pair is [string, 'DENY' | 'GRANT'] => pair[1] !== 'NONE')
    .map(([code, effect]) => ({ code, effect }));
  const overridesDirty =
    detail !== null &&
    !sameSet(
      desiredOverrides.map(({ code, effect }) => `${code}:${effect}`),
      detail.overrides.map(({ code, effect }) => `${code}:${effect}`),
    );

  function applySaved(saved: UserDetail, message: string) {
    changedRef.current = true;
    setDetail(saved);
    setSelectedRoles(saved.roles);
    setExceptions(overridesOf(saved));
    setNotice(message);
  }

  async function save(section: 'roles' | 'overrides') {
    if (busy || !detail) return;
    setBusy(section);
    setError('');
    setNotice('');
    try {
      const csrf = await getCsrfToken();
      const key = crypto.randomUUID();
      if (section === 'roles') {
        applySaved(
          await userAdminApi.replaceRoles(
            entry.id,
            { roleCodes: selectedRoles },
            csrf,
            key,
          ),
          `Roles de ${entry.displayName} actualizados.`,
        );
      } else {
        applySaved(
          await userAdminApi.replaceOverrides(
            entry.id,
            { overrides: desiredOverrides },
            csrf,
            key,
          ),
          `Excepciones de ${entry.displayName} actualizadas.`,
        );
      }
    } catch (failure) {
      setError(
        failure instanceof ApiHttpError
          ? failure.message
          : 'No pudimos guardar el cambio.',
      );
    } finally {
      setBusy('');
    }
  }

  const close = () => onClose(changedRef.current);
  const dialogRef = useModalDialog<HTMLElement>(close, busy === '');

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="user-access-title"
        aria-modal="true"
        className="adjustment-dialog access-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <h2 id="user-access-title">Acceso de {entry.displayName}</h2>
            <p>
              Los cambios rigen desde la siguiente acción de la persona; no
              necesita volver a entrar.
            </p>
          </div>
          <button
            className="secondary-button"
            disabled={busy !== ''}
            onClick={close}
            type="button"
          >
            Cerrar
          </button>
        </header>

        {loadError ? (
          <p className="form-feedback" data-tone="error" role="alert">
            {loadError}
          </p>
        ) : !detail ? (
          <p role="status">Cargando accesos…</p>
        ) : (
          <>
            {notice ? (
              <p className="form-feedback" data-tone="success" role="status">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="form-feedback" data-tone="error" role="alert">
                {error}
              </p>
            ) : null}

            <fieldset className="access-section" disabled={busy !== ''}>
              <legend>Roles</legend>
              <div className="access-roles">
                {roles.map((role) => {
                  const locked = role.code === administratorRoleCode;
                  return (
                    <label className="check-field" key={role.code}>
                      <input
                        checked={selectedRoles.includes(role.code)}
                        disabled={locked}
                        onChange={(event) =>
                          setSelectedRoles((current) =>
                            event.target.checked
                              ? [...current, role.code]
                              : current.filter((code) => code !== role.code),
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        {role.name} <small>({role.code})</small>
                        {locked ? (
                          <small className="access-note">
                            {' '}
                            · No se asigna ni se retira desde el panel.
                          </small>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="dialog-actions">
                <span />
                <button
                  className="primary-button"
                  disabled={!rolesDirty || busy !== ''}
                  onClick={() => void save('roles')}
                  type="button"
                >
                  {busy === 'roles' ? 'Guardando…' : 'Guardar roles'}
                </button>
              </div>
            </fieldset>

            <fieldset className="access-section" disabled={busy !== ''}>
              <legend>Permisos</legend>
              <p className="check-field-status">
                Una excepción concede o deniega un permiso por encima de los
                roles; denegar siempre gana.
                {rolesDirty
                  ? ' La columna «Por roles» ya refleja los roles sin guardar.'
                  : null}
              </p>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Permiso</th>
                      <th scope="col">Por roles</th>
                      <th scope="col">Excepción</th>
                      <th scope="col">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((permission) => {
                      const exception =
                        exceptions.get(permission.code) ?? 'NONE';
                      const byRoles = grantedByRoles.has(permission.code);
                      const result =
                        exception === 'DENY'
                          ? false
                          : exception === 'GRANT' || byRoles;
                      const grantBlocked =
                        restrictedGrants.has(permission.code) &&
                        !isAdministrator;
                      const denyBlocked =
                        protectedFromDeny.has(permission.code) &&
                        isAdministrator;
                      return (
                        <tr key={permission.code}>
                          <td data-label="Permiso">
                            <strong>{permission.code}</strong>
                            <br />
                            <small>{permission.description}</small>
                          </td>
                          <td data-label="Por roles">
                            {byRoles ? 'Sí' : 'No'}
                          </td>
                          <td data-label="Excepción">
                            <select
                              aria-label={`Excepción para ${permission.code}`}
                              onChange={(event) =>
                                setExceptions((current) => {
                                  const next = new Map(current);
                                  const value = event.target.value as Exception;
                                  if (value === 'NONE')
                                    next.delete(permission.code);
                                  else next.set(permission.code, value);
                                  return next;
                                })
                              }
                              value={exception}
                            >
                              <option value="NONE">
                                {exceptionLabels.NONE}
                              </option>
                              <option
                                disabled={grantBlocked && exception !== 'GRANT'}
                                value="GRANT"
                              >
                                {exceptionLabels.GRANT}
                                {grantBlocked ? ' (solo administración)' : ''}
                              </option>
                              <option
                                disabled={denyBlocked && exception !== 'DENY'}
                                value="DENY"
                              >
                                {exceptionLabels.DENY}
                                {denyBlocked ? ' (protegido)' : ''}
                              </option>
                            </select>
                          </td>
                          <td data-label="Resultado">
                            <span
                              className="status-badge"
                              {...(result ? { 'data-tone': 'success' } : {})}
                            >
                              {result ? 'Permitido' : 'Sin acceso'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="dialog-actions">
                <span />
                <button
                  className="primary-button"
                  disabled={!overridesDirty || busy !== ''}
                  onClick={() => void save('overrides')}
                  type="button"
                >
                  {busy === 'overrides' ? 'Guardando…' : 'Guardar excepciones'}
                </button>
              </div>
            </fieldset>
          </>
        )}
      </section>
    </div>
  );
}
