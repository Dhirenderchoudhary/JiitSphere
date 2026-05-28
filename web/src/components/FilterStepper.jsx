'use client';

import { SelectField } from 'components/ui/select-field';

const steps = [
  { key: 'degree', label: 'Degree', span: 1 },
  { key: 'branch', label: 'Branch', span: 1 },
  { key: 'year', label: 'Year', span: 1 },
  { key: 'semester', label: 'Semester', span: 1 },
  { key: 'subject', label: 'Subject', span: 2 },
  { key: 'resourceType', label: 'Resource Type', span: 2 },
];

const optionKeyMap = {
  degree: 'degrees',
  branch: 'branches',
  year: 'years',
  semester: 'semesters',
  subject: 'subjects',
  resourceType: 'resourceTypes',
};

export default function FilterStepper({ filters, onChange, options }) {
  const isStepEnabled = (index) => {
    if (index === 0) return true;
    const prevKey = steps[index - 1].key;
    return !!filters[prevKey];
  };

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => {
        const enabled = isStepEnabled(index);
        const hasValue = !!filters[step.key];
        const spanClass = step.span === 2 ? 'col-span-2' : '';

        return (
          <div key={step.key} className={spanClass}>
            <label
              className={`mb-1 block text-xs font-semibold transition-colors ${enabled ? 'text-foreground' : 'text-muted-foreground/50'}`}
            >
              {step.label}
              {hasValue && (
                <span className="ml-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />
              )}
            </label>
            <SelectField
              value={filters[step.key] || ''}
              disabled={!enabled}
              onChange={(value) => onChange(step.key, value)}
              placeholder={enabled ? `Select ${step.label}` : '—'}
              options={options[optionKeyMap[step.key]] || []}
            />
          </div>
        );
      })}
    </div>
  );
}
