'use client';

import type { ProductInput } from '@sgi/contracts';
import { FormField } from '@/components/ui/form-field';

type SpecificationField =
  'materialsDescription' | 'measurementChart' | 'photosUrl';

export function ProductSpecificationsFields({
  product,
  canEdit,
  error,
  onChange,
}: Readonly<{
  product: ProductInput;
  canEdit: boolean;
  error: string;
  onChange: (field: SpecificationField, value: string) => void;
}>) {
  return (
    <fieldset className="enrichment-specs-panel">
      <legend>Medidas, materiales y fotos</legend>
      {!canEdit ? (
        <p className="hint">
          Puedes consultar y copiar esta información. Administración puede
          habilitar la edición desde el panel de accesos.
        </p>
      ) : null}
      <FormField
        label="Descripción de materiales"
        hint="Composición, características y cuidados. No se interpreta HTML."
      >
        <textarea
          rows={3}
          maxLength={4000}
          readOnly={!canEdit}
          value={product.materialsDescription ?? ''}
          placeholder="Ej. 85% poliéster, 15% elastano. Lavar con agua fría."
          onChange={(event) =>
            onChange('materialsDescription', event.target.value)
          }
        />
      </FormField>
      <FormField
        label="Tabla de medidas para este SKU"
        hint="Incluye las unidades (cm, pulgadas, etc.). Se conservan los saltos de línea."
      >
        <textarea
          rows={5}
          maxLength={8000}
          readOnly={!canEdit}
          value={product.measurementChart ?? ''}
          placeholder={'Ej. Pecho: 95–102 cm\nCintura: 82–88 cm\nLargo: 68 cm'}
          onChange={(event) => onChange('measurementChart', event.target.value)}
        />
      </FormField>
      <FormField
        label="Carpeta de fotos en Google Drive"
        hint="Pega el enlace HTTPS de la carpeta. No subimos fotos ni cambiamos sus permisos de acceso."
      >
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          maxLength={1024}
          readOnly={!canEdit}
          value={product.photosUrl ?? ''}
          placeholder="https://drive.google.com/drive/folders/…"
          onChange={(event) => onChange('photosUrl', event.target.value)}
        />
      </FormField>
      {error ? (
        <p className="form-feedback" data-tone="error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
