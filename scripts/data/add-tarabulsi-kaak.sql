-- One-off import: صاجيات وكعك طحان (the name on the logo). Safe to re-run:
-- existing rows are kept and only the restaurant name is brought up to date.
-- Location from the owner's Google Maps pin. The logo is uploaded from the admin
-- panel (Restaurants → edit → image).
BEGIN;
INSERT INTO restaurants (id, name, name_ar, category, category_ar, rating, review_count, delivery_time,
  delivery_fee, min_order, image, tags, is_open, phone, lat, lon)
VALUES ('rest_tahhan_kaak', 'Tahhan Saj & Kaak', 'صاجيات وكعك طحان', 'medical_services_mod2i9xh', 'المعجنات والفطور', 0, 0,
  '30-45 دقيقة', 80, 0, '', '[]'::jsonb, true, '0984037151', 34.745945, 36.687397)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, name_ar = EXCLUDED.name_ar;
INSERT INTO menu_items (id, restaurant_id, name, name_ar, description, description_ar, price, image, category, category_ar)
VALUES
  ('item_tahhan_01', 'rest_tahhan_kaak', 'شلل', 'شلل', '', '', 130, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_02', 'rest_tahhan_kaak', 'شلل شطة', 'شلل شطة', '', '', 140, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_03', 'rest_tahhan_kaak', 'شلل بيكون', 'شلل بيكون', '', '', 140, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_04', 'rest_tahhan_kaak', 'شلل ذرة', 'شلل ذرة', '', '', 150, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_05', 'rest_tahhan_kaak', 'شلل مايونيز', 'شلل مايونيز', '', '', 150, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_06', 'rest_tahhan_kaak', 'شلل برينكلز', 'شلل برينكلز', '', '', 220, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_07', 'rest_tahhan_kaak', 'شلل باربكيو', 'شلل باربكيو', '', '', 150, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_08', 'rest_tahhan_kaak', 'شلل كاتشب', 'شلل كاتشب', '', '', 150, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_09', 'rest_tahhan_kaak', 'شلل مايو حار', 'شلل مايو حار', '', '', 150, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_10', 'rest_tahhan_kaak', 'شلل مرتديلا', 'شلل مرتديلا', '', '', 150, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_11', 'rest_tahhan_kaak', 'شلل شيدر', 'شلل شيدر', '', '', 160, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_12', 'rest_tahhan_kaak', 'شلل شيتوس', 'شلل شيتوس', '', '', 160, '', 'Chalal kaak', 'كعك بالشلل'),
  ('item_tahhan_13', 'rest_tahhan_kaak', 'قشقوان', 'قشقوان', '', '', 150, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_14', 'rest_tahhan_kaak', 'قشقوان بيكون', 'قشقوان بيكون', '', '', 160, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_15', 'rest_tahhan_kaak', 'قشقوان ذرة', 'قشقوان ذرة', '', '', 170, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_16', 'rest_tahhan_kaak', 'قشقوان باربكيو', 'قشقوان باربكيو', '', '', 170, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_17', 'rest_tahhan_kaak', 'قشقوان شلل', 'قشقوان شلل', '', '', 170, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_18', 'rest_tahhan_kaak', 'قشقوان مرتديلا', 'قشقوان مرتديلا', '', '', 170, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_19', 'rest_tahhan_kaak', 'قشقوان شيدر', 'قشقوان شيدر', '', '', 170, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_20', 'rest_tahhan_kaak', 'قشقوان مايو حار', 'قشقوان مايو حار', '', '', 170, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_21', 'rest_tahhan_kaak', 'قشقوان مايونيز', 'قشقوان مايونيز', '', '', 170, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_22', 'rest_tahhan_kaak', 'قشقوان كاتشب', 'قشقوان كاتشب', '', '', 180, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_23', 'rest_tahhan_kaak', 'قشقوان شيتوس', 'قشقوان شيتوس', '', '', 180, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_24', 'rest_tahhan_kaak', 'قشقوان برينكلز', 'قشقوان برينكلز', '', '', 230, '', 'Kashkawan kaak', 'كعك بالقشقوان'),
  ('item_tahhan_25', 'rest_tahhan_kaak', 'كعك طحان', 'كعك طحان', '', '', 230, '', 'Specials', 'المميز'),
  ('item_tahhan_26', 'rest_tahhan_kaak', 'MIX', 'MIX', '', '', 200, '', 'Specials', 'المميز'),
  ('item_tahhan_27', 'rest_tahhan_kaak', 'فاهيتا', 'فاهيتا', '', '', 300, '', 'Specials', 'المميز'),
  ('item_tahhan_28', 'rest_tahhan_kaak', 'MIX DILSSO', 'MIX DILSSO', '', '', 230, '', 'Specials', 'المميز'),
  ('item_tahhan_29', 'rest_tahhan_kaak', 'صحن مشكل صوص', 'صحن مشكل صوص', '', '', 10, '', 'Extras', 'إضافات')
ON CONFLICT (id) DO NOTHING;
SELECT name_ar, COUNT(*) FROM menu_items WHERE restaurant_id='rest_tahhan_kaak' GROUP BY 1 HAVING COUNT(*)>1;
SELECT name_ar, (SELECT COUNT(*) FROM menu_items WHERE restaurant_id='rest_tahhan_kaak') AS items
FROM restaurants WHERE id='rest_tahhan_kaak';
COMMIT;
