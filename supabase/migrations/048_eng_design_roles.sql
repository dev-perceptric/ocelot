-- Detailed roles for engineering and design, so they get their own pages (/frontend-developer-jobs,
-- /remote-product-designer-jobs-in-texas) and their own filter options, like marketing, sales and customer success.
-- The app's copy: ROLES in src/lib/taxonomy.ts (tests/lists.test.ts). Imported jobs get their role from the title on
-- the next job board sync (guessAreaRole in src/lib/ats/normalize.ts); employers pick one in the job form.

insert into public.roles (slug, category, name, sort) values
  ('frontend', 'engineering', 'Frontend', 40),
  ('backend', 'engineering', 'Backend', 41),
  ('full_stack', 'engineering', 'Full-stack', 42),
  ('mobile', 'engineering', 'Mobile', 43),
  ('devops', 'engineering', 'DevOps and SRE', 44),
  ('qa', 'engineering', 'QA and testing', 45),
  ('security', 'engineering', 'Security', 46),
  ('eng_lead', 'engineering', 'Engineering leadership', 47),
  ('product_design', 'design', 'Product and UX design', 50),
  ('ux_research', 'design', 'UX research', 51),
  ('brand_design', 'design', 'Brand and graphic design', 52),
  ('motion', 'design', 'Motion and illustration', 53),
  ('design_lead', 'design', 'Design leadership', 54);
