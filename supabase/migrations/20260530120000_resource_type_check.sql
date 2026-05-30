-- Tighten resources.resource_type and service_items/service_categories.required_resource_type
-- to the five station types the app actually knows about. Until now these columns were free
-- TEXT and a typo (e.g. 'nail_table' vs the canonical 'nail_station') silently slipped through
-- and broke type-matching (auto-assign, picker filter, server compatibility check). The CHECK
-- makes the typo loud.
--
-- Taxonomy must stay in sync with src/lib/resource-types.ts. If we add a new type (e.g. a
-- waxing bay) update both places together.

-- All current rows already use one of these values (verified 2026-05-30: massage_bed,
-- hair_chair, nail_station, rest_room across both branches).
ALTER TABLE resources
  ADD CONSTRAINT resources_resource_type_check
  CHECK (resource_type IN ('massage_bed', 'rest_room', 'hair_chair', 'nail_station', 'steam_room'));

-- service_items.required_resource_type is NULLABLE (services that don't need a specific
-- station — e.g. ad-hoc services); the CHECK accepts NULL alongside the five known values.
ALTER TABLE service_items
  ADD CONSTRAINT service_items_required_resource_type_check
  CHECK (required_resource_type IS NULL
         OR required_resource_type IN ('massage_bed', 'rest_room', 'hair_chair', 'nail_station', 'steam_room'));

ALTER TABLE service_categories
  ADD CONSTRAINT service_categories_required_resource_type_check
  CHECK (required_resource_type IS NULL
         OR required_resource_type IN ('massage_bed', 'rest_room', 'hair_chair', 'nail_station', 'steam_room'));
