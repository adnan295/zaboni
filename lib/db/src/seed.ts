import { db } from "./index";
import {
  restaurantsTable,
  menuItemsTable,
  promoBannersTable,
  restaurantCategoriesTable,
  promoCodesTable,
} from "./schema";

// ─── Categories ─────────────────────────────────────────────────────────────
const restaurantCategories = [
  { id: "cat_restaurants", code: "restaurants", nameAr: "مطاعم",     nameEn: "Restaurants", iconName: "restaurant",       sortOrder: 1,  isActive: true },
  { id: "cat_burgers",     code: "burgers",     nameAr: "برجر",      nameEn: "Burgers",      iconName: "lunch-dining",     sortOrder: 2,  isActive: true },
  { id: "cat_pizza",       code: "pizza",       nameAr: "بيتزا",     nameEn: "Pizza",        iconName: "local-pizza",      sortOrder: 3,  isActive: true },
  { id: "cat_shawarma",    code: "shawarma",    nameAr: "شاورما",    nameEn: "Shawarma",     iconName: "kebab-dining",     sortOrder: 4,  isActive: true },
  { id: "cat_coffee",      code: "coffee",      nameAr: "قهوة",      nameEn: "Coffee",       iconName: "coffee",           sortOrder: 5,  isActive: true },
  { id: "cat_sweets",      code: "sweets",      nameAr: "حلويات",    nameEn: "Sweets",       iconName: "cake",             sortOrder: 6,  isActive: true },
  { id: "cat_juice",       code: "juice",       nameAr: "عصائر",     nameEn: "Juice",        iconName: "local-bar",        sortOrder: 7,  isActive: true },
  { id: "cat_seafood",     code: "seafood",     nameAr: "مأكولات بحرية", nameEn: "Seafood",  iconName: "set-meal",         sortOrder: 8,  isActive: true },
  { id: "cat_grocery",     code: "grocery",     nameAr: "بقالة",     nameEn: "Grocery",      iconName: "storefront",       sortOrder: 9,  isActive: true },
  { id: "cat_pharmacy",    code: "pharmacy",    nameAr: "صيدلية",    nameEn: "Pharmacy",     iconName: "medical-services", sortOrder: 10, isActive: true },
];

// ─── Restaurants ─────────────────────────────────────────────────────────────
const restaurants = [
  // ── Fast food & Burgers
  {
    id: "r_burger1",
    name: "Burger House", nameAr: "برجر هاوس",
    category: "burgers", categoryAr: "برجر",
    rating: 4.9, reviewCount: 18200,
    deliveryTime: "20-25", deliveryFee: 0, minOrder: 15,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80",
    tags: ["برجر", "فاست فود", "وجبات سريعة"],
    isOpen: true, discount: "خصم 30%",
    phone: "0944 100 111", sortOrder: 1,
  },
  {
    id: "r_burger2",
    name: "Smash Burger", nameAr: "سماش برجر",
    category: "burgers", categoryAr: "برجر",
    rating: 4.7, reviewCount: 9400,
    deliveryTime: "25-30", deliveryFee: 5, minOrder: 20,
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80",
    tags: ["برجر", "سماش", "فاست فود"],
    isOpen: true,
    phone: "0933 100 222", sortOrder: 2,
  },
  {
    id: "r_kfc",
    name: "KFC Damascus", nameAr: "كنتاكي دمشق",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.5, reviewCount: 21000,
    deliveryTime: "20-30", deliveryFee: 0, minOrder: 15,
    image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=800&q=80",
    tags: ["دجاج", "فاست فود", "وجبات"],
    isOpen: true, discount: "وجبة عائلية بنص السعر",
    phone: "0962 200 111", sortOrder: 3,
  },
  {
    id: "r_mcdo",
    name: "McDonald's", nameAr: "ماكدونالدز",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.4, reviewCount: 31500,
    deliveryTime: "25-30", deliveryFee: 0, minOrder: 10,
    image: "https://images.unsplash.com/photo-1606755962773-d324e9a13086?w=800&q=80",
    tags: ["برجر", "فاست فود", "دجاج"],
    isOpen: true,
    phone: "0944 300 444", sortOrder: 4,
  },
  // ── Al Baik & Herfy
  {
    id: "r1",
    name: "Al Baik", nameAr: "البيك",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.8, reviewCount: 12500,
    deliveryTime: "25-35", deliveryFee: 0, minOrder: 15,
    image: "https://images.unsplash.com/photo-1587301669222-2b3f5898b5e5?w=800&q=80",
    tags: ["دجاج", "بروست", "وجبات سريعة"],
    isOpen: true, discount: "خصم 20%",
    phone: "0944 100 101", sortOrder: 5,
  },
  {
    id: "r6",
    name: "Herfy", nameAr: "هرفي",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.2, reviewCount: 5600,
    deliveryTime: "20-35", deliveryFee: 0, minOrder: 15,
    image: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=800&q=80",
    tags: ["برجر", "دجاج"],
    isOpen: false,
    phone: "0962 600 606", sortOrder: 6,
  },
  // ── Shawarma
  {
    id: "r_shwr1",
    name: "Al Reef Shawarma", nameAr: "شاورما الريف",
    category: "shawarma", categoryAr: "شاورما",
    rating: 4.8, reviewCount: 14300,
    deliveryTime: "15-20", deliveryFee: 0, minOrder: 10,
    image: "https://images.unsplash.com/photo-1529006557810-274d6785fc86?w=800&q=80",
    tags: ["شاورما", "ساندويش", "سريع"],
    isOpen: true, discount: "خصم 15%",
    phone: "0933 400 555", sortOrder: 7,
  },
  {
    id: "r_shwr2",
    name: "Shami Shawarma", nameAr: "شاورما شامي",
    category: "shawarma", categoryAr: "شاورما",
    rating: 4.6, reviewCount: 7100,
    deliveryTime: "20-25", deliveryFee: 0, minOrder: 10,
    image: "https://images.unsplash.com/photo-1561050501-a2aeb0b56e05?w=800&q=80",
    tags: ["شاورما", "فروج", "لحم"],
    isOpen: true,
    phone: "0944 500 666", sortOrder: 8,
  },
  // ── Pizza
  {
    id: "r3",
    name: "Pizza Hut", nameAr: "بيتزا هت",
    category: "pizza", categoryAr: "بيتزا",
    rating: 4.3, reviewCount: 6200,
    deliveryTime: "30-45", deliveryFee: 0, minOrder: 25,
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80",
    tags: ["بيتزا", "إيطالي", "باستا"],
    isOpen: true, discount: "اشتري 1 واحصل على 1",
    phone: "0962 300 303", sortOrder: 9,
  },
  {
    id: "r_pizza2",
    name: "Pizza Station", nameAr: "بيتزا ستيشن",
    category: "pizza", categoryAr: "بيتزا",
    rating: 4.7, reviewCount: 8800,
    deliveryTime: "25-35", deliveryFee: 5, minOrder: 20,
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80",
    tags: ["بيتزا", "عروض", "إيطالي"],
    isOpen: true, discount: "3 بيتزا بسعر 2",
    phone: "0933 700 888", sortOrder: 10,
  },
  // ── Grills / Mshawi
  {
    id: "r_aseel",
    name: "Al Aseel Grills", nameAr: "مطعم الأصيل",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.8, reviewCount: 11200,
    deliveryTime: "25-35", deliveryFee: 0, minOrder: 30,
    image: "https://images.unsplash.com/photo-1544025162-d76538740c6d?w=800&q=80",
    tags: ["مشاوي", "لحم", "دجاج مشوي"],
    isOpen: true,
    phone: "0962 800 999", sortOrder: 11,
  },
  // ── Falafel / Sandwiches
  {
    id: "r_falafel",
    name: "Abu Ali Falafel", nameAr: "فلافل أبو علي",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.6, reviewCount: 9900,
    deliveryTime: "10-20", deliveryFee: 0, minOrder: 5,
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    tags: ["فلافل", "حمص", "شعبي", "سريع"],
    isOpen: true,
    phone: "0944 900 010", sortOrder: 12,
  },
  // ── Coffee
  {
    id: "r4",
    name: "Starbucks", nameAr: "ستاربكس",
    category: "coffee", categoryAr: "قهوة",
    rating: 4.6, reviewCount: 9800,
    deliveryTime: "15-25", deliveryFee: 8, minOrder: 10,
    image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&q=80",
    tags: ["قهوة", "مشروبات"],
    isOpen: true,
    phone: "0944 400 404", sortOrder: 13,
  },
  {
    id: "r_cafe",
    name: "Greek Cafe", nameAr: "كافيه جريك",
    category: "coffee", categoryAr: "قهوة",
    rating: 4.8, reviewCount: 5600,
    deliveryTime: "10-15", deliveryFee: 0, minOrder: 8,
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80",
    tags: ["قهوة", "كابتشينو", "سريع"],
    isOpen: true, discount: "قهوة مجانية مع كل طلب",
    phone: "0933 010 020", sortOrder: 14,
  },
  // ── Juice
  {
    id: "r_juice",
    name: "Fresh Juice", nameAr: "عصير الريف",
    category: "juice", categoryAr: "عصائر",
    rating: 4.5, reviewCount: 4300,
    deliveryTime: "15-20", deliveryFee: 5, minOrder: 8,
    image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=800&q=80",
    tags: ["عصائر", "طازج", "مشروبات"],
    isOpen: true,
    phone: "0944 020 030", sortOrder: 15,
  },
  // ── Sweets
  {
    id: "r7",
    name: "Baskin Robbins", nameAr: "باسكن روبنز",
    category: "sweets", categoryAr: "حلويات",
    rating: 4.5, reviewCount: 4100,
    deliveryTime: "20-30", deliveryFee: 10, minOrder: 20,
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800&q=80",
    tags: ["آيس كريم", "حلويات"],
    isOpen: true,
    phone: "0944 700 707", sortOrder: 16,
  },
  {
    id: "r_sweets",
    name: "Al Sham Sweets", nameAr: "حلويات الشام",
    category: "sweets", categoryAr: "حلويات",
    rating: 4.7, reviewCount: 7800,
    deliveryTime: "30-40", deliveryFee: 0, minOrder: 25,
    image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800&q=80",
    tags: ["حلويات شرقية", "كنافة", "بقلاوة"],
    isOpen: true, discount: "خصم 15%",
    phone: "0962 030 040", sortOrder: 17,
  },
  // ── Seafood
  {
    id: "r_seafood",
    name: "Al Bahr Seafood", nameAr: "بحري سيفود",
    category: "seafood", categoryAr: "مأكولات بحرية",
    rating: 4.7, reviewCount: 6200,
    deliveryTime: "30-40", deliveryFee: 0, minOrder: 40,
    image: "https://images.unsplash.com/photo-1559847844-5315695dadae?w=800&q=80",
    tags: ["سمك", "مأكولات بحرية", "روبيان"],
    isOpen: true,
    phone: "0933 040 050", sortOrder: 18,
  },
  // ── Grocery / Pharmacy
  {
    id: "r5",
    name: "Danube Supermarket", nameAr: "دانوب",
    category: "grocery", categoryAr: "بقالة",
    rating: 4.4, reviewCount: 3400,
    deliveryTime: "40-60", deliveryFee: 15, minOrder: 50,
    image: "https://images.unsplash.com/photo-1604719312566-8912e9c8a213?w=800&q=80",
    tags: ["بقالة", "خضروات", "طازج"],
    isOpen: true,
    phone: "0933 500 505", sortOrder: 19,
  },
  {
    id: "r8",
    name: "Al Dawaa Pharmacy", nameAr: "صيدلية الدواء",
    category: "pharmacy", categoryAr: "صيدلية",
    rating: 4.7, reviewCount: 2300,
    deliveryTime: "30-45", deliveryFee: 0, minOrder: 30,
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80",
    tags: ["أدوية", "صحة", "فيتامينات"],
    isOpen: true,
    phone: "0933 800 808", sortOrder: 20,
  },
  // ── Sushi (keep from original v2)
  {
    id: "r2",
    name: "Kudu", nameAr: "كودو",
    category: "burgers", categoryAr: "برجر",
    rating: 4.5, reviewCount: 8900,
    deliveryTime: "20-30", deliveryFee: 5, minOrder: 20,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80",
    tags: ["برجر", "فاست فود"],
    isOpen: true,
    phone: "0933 200 202", sortOrder: 21,
  },
];

// ─── Menu Items ──────────────────────────────────────────────────────────────
const menuItems = [
  // ── برجر هاوس
  { id: "mi_bh1",  restaurantId: "r_burger1", name: "Classic Burger",      nameAr: "برجر كلاسيك",       descriptionAr: "لحم بقر طازج مع جبنة شيدر وخس وطماطم",      price: 18, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80", category: "burgers", categoryAr: "برجر", isPopular: true },
  { id: "mi_bh2",  restaurantId: "r_burger1", name: "Double Smash",        nameAr: "دبل سماش",           descriptionAr: "برجر مزدوج سماش مع صوص خاص وبيكل",           price: 28, image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=80", category: "burgers", categoryAr: "برجر", isPopular: true },
  { id: "mi_bh3",  restaurantId: "r_burger1", name: "Crispy Chicken",      nameAr: "كريسبي دجاج",        descriptionAr: "دجاج مقرمش مع مايونيز وخس",                   price: 22, image: "https://images.unsplash.com/photo-1606755962773-d324e9a13086?w=400&q=80", category: "burgers", categoryAr: "برجر", isPopular: false },
  { id: "mi_bh4",  restaurantId: "r_burger1", name: "Cheese Tower",        nameAr: "برجر الجبن",         descriptionAr: "برجر بثلاث طبقات جبن كريمي وسماش",           price: 35, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=80", category: "burgers", categoryAr: "برجر", isPopular: false },
  { id: "mi_bh5",  restaurantId: "r_burger1", name: "Curly Fries",         nameAr: "بطاطس محلزنة",       descriptionAr: "بطاطس محلزنة مقرمشة مع صوص",                  price: 8,  image: "https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=400&q=80", category: "sides",   categoryAr: "مقبلات", isPopular: false },
  { id: "mi_bh6",  restaurantId: "r_burger1", name: "Meal Deal",           nameAr: "وجبة كاملة",         descriptionAr: "برجر + بطاطس كبيرة + مشروب",                 price: 32, image: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400&q=80", category: "meals",   categoryAr: "وجبات", isPopular: true },

  // ── كنتاكي
  { id: "mi_kfc1", restaurantId: "r_kfc",     name: "Crispy Chicken Box",  nameAr: "صندوق دجاج كريسبي", descriptionAr: "3 قطع دجاج كريسبي مع بطاطس وكول سلو",         price: 25, image: "https://images.unsplash.com/photo-1587301669222-2b3f5898b5e5?w=400&q=80", category: "meals",   categoryAr: "وجبات", isPopular: true },
  { id: "mi_kfc2", restaurantId: "r_kfc",     name: "Family Bucket 12pc",  nameAr: "دلو العائلة 12 قطعة", descriptionAr: "12 قطعة دجاج مشكلة مع بطاطس كبيرة",          price: 85, image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80", category: "family",  categoryAr: "عروض عائلية", isPopular: true },
  { id: "mi_kfc3", restaurantId: "r_kfc",     name: "Zinger Burger",       nameAr: "زنجر برجر",          descriptionAr: "برجر دجاج حار مقرمش مع جبنة",                price: 22, image: "https://images.unsplash.com/photo-1606755962773-d324e9a13086?w=400&q=80", category: "burgers", categoryAr: "برجر", isPopular: false },
  { id: "mi_kfc4", restaurantId: "r_kfc",     name: "Popcorn Chicken",     nameAr: "بوبكورن دجاج",       descriptionAr: "قطع دجاج صغيرة مقرمشة بالتوابل",             price: 15, image: "https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&q=80", category: "snacks",  categoryAr: "سناك", isPopular: false },

  // ── البيك
  { id: "m1",      restaurantId: "r1",         name: "Broast Meal",         nameAr: "وجبة بروست",         descriptionAr: "دجاج بروست مقرمش مع بطاطس وصلصة",             price: 22, image: "https://images.unsplash.com/photo-1587301669222-2b3f5898b5e5?w=400&q=80", category: "meals",   categoryAr: "وجبات", isPopular: true },
  { id: "m2",      restaurantId: "r1",         name: "Fish Meal",           nameAr: "وجبة سمك",           descriptionAr: "سمك مقلي مقرمش مع بطاطس",                    price: 25, image: "https://images.unsplash.com/photo-1519984388953-d2406bc725e1?w=400&q=80", category: "meals",   categoryAr: "وجبات", isPopular: false },
  { id: "m3",      restaurantId: "r1",         name: "Shrimp Meal",         nameAr: "وجبة روبيان",        descriptionAr: "روبيان مقلي مقرمش مع بطاطس",                 price: 30, image: "https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&q=80", category: "meals",   categoryAr: "وجبات", isPopular: false },
  { id: "m4",      restaurantId: "r1",         name: "Family Bucket",       nameAr: "دلو عائلي",          descriptionAr: "دلو كبير من الدجاج المبروست",                 price: 75, image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80", category: "family",  categoryAr: "عروض عائلية", isPopular: true },
  { id: "m5",      restaurantId: "r1",         name: "Garlic Sauce",        nameAr: "صلصة ثوم",           descriptionAr: "صلصة الثوم الشهيرة من البيك",                 price: 3,  image: "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&q=80", category: "extras",  categoryAr: "إضافات", isPopular: false },

  // ── شاورما الريف
  { id: "mi_sh1",  restaurantId: "r_shwr1",   name: "Chicken Shawarma",    nameAr: "شاورما فروج",        descriptionAr: "شاورما دجاج مشوي مع ثوم وحامض في خبز عربي", price: 12, image: "https://images.unsplash.com/photo-1529006557810-274d6785fc86?w=400&q=80", category: "sandwiches", categoryAr: "ساندويشات", isPopular: true },
  { id: "mi_sh2",  restaurantId: "r_shwr1",   name: "Meat Shawarma",       nameAr: "شاورما لحم",         descriptionAr: "شاورما لحم مشوي مع بصل مشكل وطحينة",          price: 15, image: "https://images.unsplash.com/photo-1561050501-a2aeb0b56e05?w=400&q=80", category: "sandwiches", categoryAr: "ساندويشات", isPopular: true },
  { id: "mi_sh3",  restaurantId: "r_shwr1",   name: "Shawarma Plate",      nameAr: "صحن شاورما",         descriptionAr: "شاورما مشكل مع أرز وسلطة وخبز",              price: 22, image: "https://images.unsplash.com/photo-1544025162-d76538740c6d?w=400&q=80", category: "plates",  categoryAr: "أطباق", isPopular: false },
  { id: "mi_sh4",  restaurantId: "r_shwr1",   name: "Fattoush Salad",      nameAr: "سلطة فتوش",          descriptionAr: "سلطة فتوش طازجة بالخضروات والخبز المحمص",      price: 8,  image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80", category: "salads",  categoryAr: "سلطات", isPopular: false },

  // ── بيتزا هت
  { id: "m9",      restaurantId: "r3",         name: "Pepperoni Pizza",     nameAr: "بيتزا ببروني",       descriptionAr: "بيتزا ببروني كلاسيك حجم كبير",               price: 55, image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80", category: "pizza",   categoryAr: "بيتزا", isPopular: true },
  { id: "m10",     restaurantId: "r3",         name: "BBQ Chicken Pizza",   nameAr: "بيتزا دجاج باربكيو", descriptionAr: "بيتزا دجاج باربكيو مع فلفل",                  price: 58, image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&q=80", category: "pizza",   categoryAr: "بيتزا", isPopular: false },
  { id: "m11",     restaurantId: "r3",         name: "Pasta Alfredo",       nameAr: "باستا الفريدو",      descriptionAr: "باستا كريمية مع الدجاج",                      price: 35, image: "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&q=80", category: "pasta",   categoryAr: "باستا", isPopular: false },
  { id: "mi_ph4",  restaurantId: "r3",         name: "Garlic Bread",        nameAr: "خبز ثوم",            descriptionAr: "خبز ثوم محمص مع جبنة موزاريلا",              price: 18, image: "https://images.unsplash.com/photo-1513442542250-854d436a73f2?w=400&q=80", category: "sides",   categoryAr: "مقبلات", isPopular: false },

  // ── بيتزا ستيشن
  { id: "mi_ps1",  restaurantId: "r_pizza2",  name: "Margherita",          nameAr: "مرغريتا",            descriptionAr: "بيتزا مرغريتا مع صوص طماطم وموزاريلا",       price: 40, image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80", category: "pizza",   categoryAr: "بيتزا", isPopular: true },
  { id: "mi_ps2",  restaurantId: "r_pizza2",  name: "Meat Feast",          nameAr: "بيتزا اللحوم",       descriptionAr: "بيتزا باللحم المفروم والسجق والببروني",       price: 65, image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&q=80", category: "pizza",   categoryAr: "بيتزا", isPopular: true },
  { id: "mi_ps3",  restaurantId: "r_pizza2",  name: "Veggie Delight",      nameAr: "بيتزا خضار",         descriptionAr: "بيتزا بالخضروات الطازجة والجبن",             price: 45, image: "https://images.unsplash.com/photo-1513442542250-854d436a73f2?w=400&q=80", category: "pizza",   categoryAr: "بيتزا", isPopular: false },

  // ── مطعم الأصيل
  { id: "mi_as1",  restaurantId: "r_aseel",   name: "Mixed Grill",         nameAr: "مشاوي مشكل",         descriptionAr: "كباب ودجاج مشوي مع خبز وسلطة",               price: 55, image: "https://images.unsplash.com/photo-1544025162-d76538740c6d?w=400&q=80", category: "grills",  categoryAr: "مشاوي", isPopular: true },
  { id: "mi_as2",  restaurantId: "r_aseel",   name: "Kebab Plate",         nameAr: "صحن كباب",           descriptionAr: "كباب لحم مع أرز وخبز ومخللات",               price: 40, image: "https://images.unsplash.com/photo-1529006557810-274d6785fc86?w=400&q=80", category: "grills",  categoryAr: "مشاوي", isPopular: true },
  { id: "mi_as3",  restaurantId: "r_aseel",   name: "Grilled Chicken",     nameAr: "دجاج مشوي",          descriptionAr: "نصف دجاج مشوي مع ثوم وليمون",                price: 35, image: "https://images.unsplash.com/photo-1587301669222-2b3f5898b5e5?w=400&q=80", category: "grills",  categoryAr: "مشاوي", isPopular: false },
  { id: "mi_as4",  restaurantId: "r_aseel",   name: "Hummus",              nameAr: "حمص",                descriptionAr: "حمص طازج بالزيت والبابريكا",                  price: 10, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=80", category: "starters",categoryAr: "مقبلات", isPopular: false },

  // ── فلافل أبو علي
  { id: "mi_fl1",  restaurantId: "r_falafel", name: "Falafel Sandwich",    nameAr: "ساندويش فلافل",      descriptionAr: "فلافل مقلية مع حمص وسلطة في خبز عربي",       price: 5,  image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=80", category: "sandwiches", categoryAr: "ساندويشات", isPopular: true },
  { id: "mi_fl2",  restaurantId: "r_falafel", name: "Hummus Plate",        nameAr: "صحن حمص",            descriptionAr: "حمص بالزيت والبقدونس مع خبز",                 price: 8,  image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80", category: "plates",  categoryAr: "أطباق", isPopular: false },
  { id: "mi_fl3",  restaurantId: "r_falafel", name: "Falafel Box 10pc",    nameAr: "صندوق فلافل 10 حبات", descriptionAr: "10 حبات فلافل مع صوص",                       price: 15, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=80", category: "plates",  categoryAr: "أطباق", isPopular: false },

  // ── ستاربكس
  { id: "m12",     restaurantId: "r4",         name: "Caramel Macchiato",   nameAr: "كراميل ماكياتو",     descriptionAr: "إسبريسو مع كراميل وفانيلا",                   price: 22, image: "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&q=80", category: "hot",     categoryAr: "ساخنة", isPopular: true },
  { id: "m13",     restaurantId: "r4",         name: "Frappuccino",         nameAr: "فرابتشينو",           descriptionAr: "مشروب قهوة بارد مثلج",                        price: 24, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&q=80", category: "cold",    categoryAr: "باردة", isPopular: true },
  { id: "m14",     restaurantId: "r4",         name: "Green Tea Latte",     nameAr: "لاتيه شاي أخضر",     descriptionAr: "لاتيه شاي أخضر ماتشا",                        price: 20, image: "https://images.unsplash.com/photo-1515823662972-da6a2e4d3002?w=400&q=80", category: "hot",     categoryAr: "ساخنة", isPopular: false },
  { id: "mi_sb4",  restaurantId: "r4",         name: "Cold Brew",           nameAr: "كولد برو",            descriptionAr: "قهوة باردة منقوعة 24 ساعة",                   price: 20, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80", category: "cold",    categoryAr: "باردة", isPopular: false },
  { id: "mi_sb5",  restaurantId: "r4",         name: "Chocolate Cake",      nameAr: "كيكة شوكولاتة",      descriptionAr: "كيكة شوكولاتة طبقتين مع كريمة",              price: 18, image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=400&q=80", category: "food",    categoryAr: "أطعمة", isPopular: false },

  // ── كافيه جريك
  { id: "mi_gc1",  restaurantId: "r_cafe",    name: "Greek Frappe",        nameAr: "فرابيه يوناني",       descriptionAr: "فرابيه قهوة كريمي برد",                       price: 12, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80", category: "cold",    categoryAr: "باردة", isPopular: true },
  { id: "mi_gc2",  restaurantId: "r_cafe",    name: "Double Espresso",     nameAr: "إسبريسو مزدوج",       descriptionAr: "إسبريسو مركّز بتحضير إيطالي",                 price: 8,  image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&q=80", category: "hot",     categoryAr: "ساخنة", isPopular: false },
  { id: "mi_gc3",  restaurantId: "r_cafe",    name: "Lotus Latte",         nameAr: "لاتيه لوتس",          descriptionAr: "لاتيه بكريم لوتس وحليب مرغي",                 price: 15, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&q=80", category: "hot",     categoryAr: "ساخنة", isPopular: true },

  // ── عصير الريف
  { id: "mi_jr1",  restaurantId: "r_juice",   name: "Orange Juice",        nameAr: "عصير برتقال",        descriptionAr: "عصير برتقال طازج 100%",                        price: 8,  image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&q=80", category: "fresh",   categoryAr: "طازج", isPopular: true },
  { id: "mi_jr2",  restaurantId: "r_juice",   name: "Mango Smoothie",      nameAr: "سموثي مانجو",        descriptionAr: "سموثي مانجو وموز بالحليب",                     price: 12, image: "https://images.unsplash.com/photo-1498753427761-0a87f60a40e9?w=400&q=80", category: "smoothie",categoryAr: "سموثي", isPopular: true },
  { id: "mi_jr3",  restaurantId: "r_juice",   name: "Mix Juice",           nameAr: "عصير مشكل",          descriptionAr: "خليط من الفواكه الموسمية",                     price: 10, image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&q=80", category: "fresh",   categoryAr: "طازج", isPopular: false },

  // ── باسكن روبنز
  { id: "mi_br1",  restaurantId: "r7",         name: "Double Scoop",        nameAr: "سكوبتين",             descriptionAr: "سكوبتين آيس كريم من اختيارك",                  price: 18, image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80", category: "ice cream",categoryAr: "آيس كريم", isPopular: true },
  { id: "mi_br2",  restaurantId: "r7",         name: "Sundae",              nameAr: "صندي",                descriptionAr: "آيس كريم بصوص شوكولاتة وكراميل",             price: 22, image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=400&q=80", category: "ice cream",categoryAr: "آيس كريم", isPopular: false },
  { id: "mi_br3",  restaurantId: "r7",         name: "Ice Cream Cake",      nameAr: "كيكة آيس كريم",      descriptionAr: "كيكة آيس كريم احتفالية",                       price: 55, image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80", category: "cakes",   categoryAr: "كيك", isPopular: false },

  // ── حلويات الشام
  { id: "mi_hs1",  restaurantId: "r_sweets",  name: "Knafeh",              nameAr: "كنافة",               descriptionAr: "كنافة نابلسية بالجبن والقطر",                  price: 20, image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=400&q=80", category: "oriental",categoryAr: "حلويات شرقية", isPopular: true },
  { id: "mi_hs2",  restaurantId: "r_sweets",  name: "Baklava Box",         nameAr: "علبة بقلاوة",         descriptionAr: "بقلاوة مشكلة بالفستق والجوز والعسل",           price: 35, image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=400&q=80", category: "oriental",categoryAr: "حلويات شرقية", isPopular: true },
  { id: "mi_hs3",  restaurantId: "r_sweets",  name: "Mamool",              nameAr: "معمول",               descriptionAr: "معمول بالتمر والفستق",                         price: 25, image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80", category: "oriental",categoryAr: "حلويات شرقية", isPopular: false },

  // ── بحري سيفود
  { id: "mi_sf1",  restaurantId: "r_seafood", name: "Fried Shrimp",        nameAr: "روبيان مقلي",         descriptionAr: "روبيان مقلي مقرمش مع صوص طرطر",               price: 45, image: "https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&q=80", category: "seafood", categoryAr: "مأكولات بحرية", isPopular: true },
  { id: "mi_sf2",  restaurantId: "r_seafood", name: "Grilled Fish",        nameAr: "سمكة مشوية",          descriptionAr: "سمكة كاملة مشوية مع أرز وسلطة",              price: 65, image: "https://images.unsplash.com/photo-1519984388953-d2406bc725e1?w=400&q=80", category: "seafood", categoryAr: "مأكولات بحرية", isPopular: true },
  { id: "mi_sf3",  restaurantId: "r_seafood", name: "Seafood Platter",     nameAr: "طبق مأكولات بحرية",   descriptionAr: "تشكيلة سمك وروبيان وكاليماري",               price: 90, image: "https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&q=80", category: "seafood", categoryAr: "مأكولات بحرية", isPopular: false },

  // ── كودو
  { id: "m6",      restaurantId: "r2",         name: "Kudu Burger",         nameAr: "برجر كودو",           descriptionAr: "لحم بقر مع صلصة خاصة وخضروات",               price: 28, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80", category: "burgers", categoryAr: "برجر", isPopular: true },
  { id: "m7",      restaurantId: "r2",         name: "Chicken Burger",      nameAr: "برجر دجاج",           descriptionAr: "برجر دجاج مقرمش مع مايونيز",                 price: 24, image: "https://images.unsplash.com/photo-1606755962773-d324e9a13086?w=400&q=80", category: "burgers", categoryAr: "برجر", isPopular: false },
  { id: "m8",      restaurantId: "r2",         name: "Mega Meal",           nameAr: "وجبة ميجا",           descriptionAr: "برجر مزدوج مع بطاطس كبيرة ومشروب",           price: 38, image: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400&q=80", category: "meals",   categoryAr: "وجبات", isPopular: true },
];

// ─── Promo Banners ───────────────────────────────────────────────────────────
const promoBanners = [
  {
    id: "banner_1",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&q=85",
    restaurantId: "r_burger1",
    titleAr: "خصم 30% على برجر هاوس 🍔",
    titleEn: "30% OFF Burger House",
    subtitleAr: "اطلب الآن واستمتع بأفضل برجر في المدينة",
    subtitleEn: "Order now and enjoy the best burger in town",
    iconName: "local-offer", bgColor: "#DC2626", sortOrder: 0, isActive: true,
  },
  {
    id: "banner_2",
    image: "https://images.unsplash.com/photo-1529006557810-274d6785fc86?w=900&q=85",
    restaurantId: "r_shwr1",
    titleAr: "شاورما الريف – توصيل مجاني ⚡",
    titleEn: "Al Reef Shawarma – Free Delivery",
    subtitleAr: "أسرع شاورما وأشهاها – توصيل خلال 15 دقيقة",
    subtitleEn: "Fastest & tastiest shawarma – 15-min delivery",
    iconName: "delivery-dining", bgColor: "#B45309", sortOrder: 1, isActive: true,
  },
  {
    id: "banner_3",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&q=85",
    restaurantId: "r3",
    titleAr: "بيتزا هت – اشتري 1 واحصل على 1 🍕",
    titleEn: "Pizza Hut – Buy 1 Get 1 Free",
    subtitleAr: "عرض محدود – أطلب الآن قبل انتهاء الكميات",
    subtitleEn: "Limited offer – Order now before it runs out",
    iconName: "local-pizza", bgColor: "#991B1B", sortOrder: 2, isActive: true,
  },
  {
    id: "banner_4",
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=900&q=85",
    restaurantId: "r_cafe",
    titleAr: "قهوتك بأسرع وقت ☕",
    titleEn: "Your Coffee, Fast",
    subtitleAr: "كافيه جريك – توصيل خلال 10 دقائق فقط",
    subtitleEn: "Greek Cafe – Delivered in just 10 minutes",
    iconName: "coffee", bgColor: "#1E3A5F", sortOrder: 3, isActive: true,
  },
  {
    id: "banner_5",
    image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=900&q=85",
    restaurantId: "r_sweets",
    titleAr: "حلويات الشام – خصم 15% 🍯",
    titleEn: "Al Sham Sweets – 15% Off",
    subtitleAr: "كنافة وبقلاوة ومعمول بأجود المكونات",
    subtitleEn: "Knafeh, baklava & mamool made fresh daily",
    iconName: "cake", bgColor: "#7C3AED", sortOrder: 4, isActive: true,
  },
];

// ─── Promo Codes ─────────────────────────────────────────────────────────────
const promoCodes = [
  { id: "promo_welcome",  code: "WELCOME50",  type: "percent" as const, value: 50,  maxUses: 1000, maxUsesPerUser: 1, isActive: true },
  { id: "promo_first",    code: "FIRST",      type: "fixed"   as const, value: 10,  maxUses: 500,  maxUsesPerUser: 1, isActive: true },
  { id: "promo_vip",      code: "VIP20",      type: "percent" as const, value: 20,  maxUses: null, maxUsesPerUser: 3, isActive: true },
  { id: "promo_test",     code: "TEST",       type: "fixed"   as const, value: 5,   maxUses: null, maxUsesPerUser: 10, isActive: true },
  { id: "promo_summer",   code: "SUMMER30",   type: "percent" as const, value: 30,  maxUses: 200,  maxUsesPerUser: 1, isActive: true },
];

async function seed() {
  console.log("🌱 Seeding restaurant categories...");
  for (const cat of restaurantCategories) {
    await db.insert(restaurantCategoriesTable).values(cat)
      .onConflictDoUpdate({ target: restaurantCategoriesTable.id, set: cat });
  }

  console.log("🌱 Seeding restaurants...");
  for (const r of restaurants) {
    await db.insert(restaurantsTable).values(r)
      .onConflictDoUpdate({ target: restaurantsTable.id, set: r });
  }

  console.log("🌱 Seeding menu items...");
  for (const item of menuItems) {
    await db.insert(menuItemsTable).values(item)
      .onConflictDoUpdate({ target: menuItemsTable.id, set: item });
  }

  console.log("🌱 Seeding promo banners...");
  for (const banner of promoBanners) {
    await db.insert(promoBannersTable).values(banner)
      .onConflictDoUpdate({ target: promoBannersTable.id, set: banner });
  }

  console.log("🌱 Seeding promo codes...");
  for (const promo of promoCodes) {
    await db.insert(promoCodesTable).values(promo)
      .onConflictDoNothing();
  }

  console.log("✅ Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
