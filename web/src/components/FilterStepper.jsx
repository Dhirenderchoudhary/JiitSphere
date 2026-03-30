'use client';

import { SelectField } from 'components/ui/select-field';

const steps = [
  { key: 'degree', label: 'Degree' },
  { key: 'branch', label: 'Branch' },
  { key: 'year', label: 'Year' },
  { key: 'semester', label: 'Semester' },
  { key: 'subject', label: 'Subject' },
  { key: 'resourceType', label: 'Resource Type' }
];

const optionKeyMap = {
  degree: 'degrees',
  branch: 'branches',
  year: 'years',
  semester: 'semesters',
  subject: 'subjects',
  resourceType: 'resourceTypes'
};

export default function FilterStepper({ filters, onChange, options }) {
  const isStepDisabled = (index) => {
    if (index === 0) return false;
    const prevKey = steps[index - 1].key;
    return !filters[prevKey];
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">Academic Filters</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {steps.map((step, index) => (
        <div key={step.key} className="animate-fadeInUp" style={{ animationDelay: `${index * 90}ms` }}>
          <label className="mb-1.5 block text-sm font-semibold">{step.label}</label>
          <SelectField
            value={filters[step.key] || ''}
            disabled={isStepDisabled(index)}
            onChange={(value) => onChange(step.key, value)}
            placeholder={`Select ${step.label}`}
            options={options[optionKeyMap[step.key]] || []}
          />
        </div>
      ))}
      </div>
    </div>
  );
}
