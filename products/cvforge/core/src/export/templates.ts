export const TEMPLATE_IDS = ['classic', 'modern'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TemplateStyle {
  id: TemplateId;
  name: string;
  description: string;
  font: string;
  bodySize: number; // half-points
  nameSize: number;
  headingSize: number;
  headingColor: string;
  headingUppercase: boolean;
  headingRule: boolean;
  accentColor: string;
}

export const TEMPLATES: Record<TemplateId, TemplateStyle> = {
  classic: {
    id: 'classic',
    name: 'Classic Professional',
    description: 'Single column, conventional headings, minimal decoration.',
    font: 'Arial',
    bodySize: 21,
    nameSize: 32,
    headingSize: 23,
    headingColor: '000000',
    headingUppercase: true,
    headingRule: true,
    accentColor: '000000',
  },
  modern: {
    id: 'modern',
    name: 'Modern Professional',
    description: 'Single column with a restrained accent colour and clear hierarchy.',
    font: 'Calibri',
    bodySize: 21,
    nameSize: 40,
    headingSize: 24,
    headingColor: '1F4E5F',
    headingUppercase: false,
    headingRule: false,
    accentColor: '1F4E5F',
  },
};
