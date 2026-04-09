import { db } from "./index";
import { restaurantsTable, menuItemsTable, promoBannersTable, restaurantCategoriesTable } from "./schema";

const restaurants = [
  {
    id: "r1", name: "Al Baik", nameAr: "البيك",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.8, reviewCount: 12500,
    deliveryTime: "25-35", deliveryFee: 0, minOrder: 15,
    image: "https://images.unsplash.com/photo-1587301669222-2b3f5898b5e5?w=400&q=80",
    tags: ["دجاج", "فاست فود", "وجبات سريعة"],
    isOpen: true, discount: "خصم 20%",
  },
  {
    id: "r2", name: "Kudu", nameAr: "كودو",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.5, reviewCount: 8900,
    deliveryTime: "20-30", deliveryFee: 5, minOrder: 20,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80",
    tags: ["برجر", "فاست فود"],
    isOpen: true,
  },
  {
    id: "r3", name: "Pizza Hut", nameAr: "بيتزا هت",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.3, reviewCount: 6200,
    deliveryTime: "30-45", deliveryFee: 0, minOrder: 25,
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80",
    tags: ["بيتزا", "إيطالي"],
    isOpen: true, discount: "اشتري 1 واحصل على 1",
  },
  {
    id: "r4", name: "Starbucks", nameAr: "ستاربكس",
    category: "coffee", categoryAr: "قهوة",
    rating: 4.6, reviewCount: 9800,
    deliveryTime: "15-25", deliveryFee: 8, minOrder: 10,
    image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&q=80",
    tags: ["قهوة", "مشروبات"],
    isOpen: true,
  },
  {
    id: "r5", name: "Danube Supermarket", nameAr: "دانوب",
    category: "grocery", categoryAr: "بقالة",
    rating: 4.4, reviewCount: 3400,
    deliveryTime: "40-60", deliveryFee: 15, minOrder: 50,
    image: "https://images.unsplash.com/photo-1604719312566-8912e9c8a213?w=400&q=80",
    tags: ["بقالة", "خضروات", "طازج"],
    isOpen: true,
  },
  {
    id: "r6", name: "Herfy", nameAr: "هرفي",
    category: "restaurants", categoryAr: "مطاعم",
    rating: 4.2, reviewCount: 5600,
    deliveryTime: "20-35", deliveryFee: 0, minOrder: 15,
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=80",
    tags: ["برجر", "دجاج"],
    isOpen: false,
  },
  {
    id: "r7", name: "Baskin Robbins", nameAr: "باسكن روبنز",
    category: "sweets", categoryAr: "حلويات",
    rating: 4.5, reviewCount: 4100,
    deliveryTime: "20-30", deliveryFee: 10, minOrder: 20,
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80",
    tags: ["آيس كريم", "حلويات"],
    isOpen: true,
  },
  {
    id: "r8", name: "Al Dawaa Pharmacy", nameAr: "صيدلية الدواء",
    category: "pharmacy", categoryAr: "صيدلية",
    rating: 4.7, reviewCount: 2300,
    deliveryTime: "30-45", deliveryFee: 0, minOrder: 30,
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80",
    tags: ["أدوية", "صحة"],
    isOpen: true,
  },
];

const menuItems = [
  { id: "m1", restaurantId: "r1", name: "Broast Meal", nameAr: "وجبة بروست", description: "Crispy broasted chicken with fries and sauce", descriptionAr: "دجاج بروست مقرمش مع بطاطس وصلصة", price: 22, image: "https://images.unsplash.com/photo-1587301669222-2b3f5898b5e5?w=300&q=80", category: "meals", categoryAr: "وجبات", isPopular: true },
  { id: "m2", restaurantId: "r1", name: "Fish Meal", nameAr: "وجبة سمك", description: "Crispy fried fish with fries", descriptionAr: "سمك مقلي مقرمش مع بطاطس", price: 25, image: "https://images.unsplash.com/photo-1519984388953-d2406bc725e1?w=300&q=80", category: "meals", categoryAr: "وجبات", isPopular: false },
  { id: "m3", restaurantId: "r1", name: "Shrimp Meal", nameAr: "وجبة روبيان", description: "Crispy fried shrimp with fries", descriptionAr: "روبيان مقلي مقرمش مع بطاطس", price: 30, image: "https://images.unsplash.com/photo-1559847844-5315695dadae?w=300&q=80", category: "meals", categoryAr: "وجبات", isPopular: false },
  { id: "m4", restaurantId: "r1", name: "Family Bucket", nameAr: "دلو عائلي", description: "Large bucket of broasted chicken", descriptionAr: "دلو كبير من الدجاج المبروست", price: 75, image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=300&q=80", category: "family", categoryAr: "عروض عائلية", isPopular: true },
  { id: "m5", restaurantId: "r1", name: "Garlic Sauce", nameAr: "صلصة ثوم", description: "Al Baik signature garlic sauce", descriptionAr: "صلصة الثوم الشهيرة من البيك", price: 3, image: "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=300&q=80", category: "extras", categoryAr: "إضافات", isPopular: false },
  { id: "m6", restaurantId: "r2", name: "Kudu Burger", nameAr: "برجر كودو", description: "Beef patty with special sauce and veggies", descriptionAr: "لحم بقر مع صلصة خاصة وخضروات", price: 28, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&q=80", category: "burgers", categoryAr: "برجر", isPopular: true },
  { id: "m7", restaurantId: "r2", name: "Chicken Burger", nameAr: "برجر دجاج", description: "Crispy chicken burger with mayo", descriptionAr: "برجر دجاج مقرمش مع مايونيز", price: 24, image: "https://images.unsplash.com/photo-1606755962773-d324e9a13086?w=300&q=80", category: "burgers", categoryAr: "برجر", isPopular: false },
  { id: "m8", restaurantId: "r2", name: "Mega Meal", nameAr: "وجبة ميجا", description: "Double burger with large fries and drink", descriptionAr: "برجر مزدوج مع بطاطس كبيرة ومشروب", price: 38, image: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=300&q=80", category: "meals", categoryAr: "وجبات", isPopular: true },
  { id: "m9", restaurantId: "r3", name: "Pepperoni Pizza", nameAr: "بيتزا ببروني", description: "Classic pepperoni pizza large size", descriptionAr: "بيتزا ببروني كلاسيك حجم كبير", price: 55, image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=300&q=80", category: "pizza", categoryAr: "بيتزا", isPopular: true },
  { id: "m10", restaurantId: "r3", name: "BBQ Chicken Pizza", nameAr: "بيتزا دجاج باربكيو", description: "BBQ chicken pizza with peppers", descriptionAr: "بيتزا دجاج باربكيو مع فلفل", price: 58, image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&q=80", category: "pizza", categoryAr: "بيتزا", isPopular: false },
  { id: "m11", restaurantId: "r3", name: "Pasta Alfredo", nameAr: "باستا الفريدو", description: "Creamy alfredo pasta with chicken", descriptionAr: "باستا كريمية مع الدجاج", price: 35, image: "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=300&q=80", category: "pasta", categoryAr: "باستا", isPopular: false },
  { id: "m12", restaurantId: "r4", name: "Caramel Macchiato", nameAr: "كراميل ماكياتو", description: "Espresso with caramel and vanilla", descriptionAr: "إسبريسو مع كراميل وفانيلا", price: 22, image: "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=300&q=80", category: "hot", categoryAr: "ساخنة", isPopular: true },
  { id: "m13", restaurantId: "r4", name: "Frappuccino", nameAr: "فرابتشينو", description: "Cold blended coffee drink", descriptionAr: "مشروب قهوة بارد مثلج", price: 24, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=300&q=80", category: "cold", categoryAr: "باردة", isPopular: true },
  { id: "m14", restaurantId: "r4", name: "Green Tea Latte", nameAr: "لاتيه شاي أخضر", description: "Matcha green tea latte", descriptionAr: "لاتيه شاي أخضر ماتشا", price: 20, image: "https://images.unsplash.com/photo-1515823662972-da6a2e4d3002?w=300&q=80", category: "hot", categoryAr: "ساخنة", isPopular: false },
];

const promoBanners = [
  { id: "banner_1", titleAr: "توصيل سريع لباب بيتك", titleEn: "Fast delivery to your door", subtitleAr: "أطلب الآن وتابع المندوب مباشرة على الخريطة", subtitleEn: "Order now and track your courier on the map", iconName: "delivery-dining", bgColor: "#FF6B00", sortOrder: 0, isActive: true },
  { id: "banner_2", titleAr: "أفضل المطاعم في دمشق", titleEn: "Best restaurants in Damascus", subtitleAr: "اكتشف قائمة متنوعة من البرغر، البيتزا، المشاوي وأكثر", subtitleEn: "Discover burgers, pizza, grills and more", iconName: "restaurant", bgColor: "#1e40af", sortOrder: 1, isActive: true },
  { id: "banner_3", titleAr: "ادفع عند الاستلام", titleEn: "Pay on delivery", subtitleAr: "لا حاجة لبطاقة بنكية — ادفع نقداً عند وصول طلبك", subtitleEn: "No bank card needed — pay cash when your order arrives", iconName: "payments", bgColor: "#065f46", sortOrder: 2, isActive: true },
];

const restaurantCategories = [
  { id: "cat_restaurants", code: "restaurants", nameAr: "مطاعم", nameEn: "Restaurants", iconName: "restaurant", sortOrder: 1, isActive: true },
  { id: "cat_grocery", code: "grocery", nameAr: "بقالة", nameEn: "Grocery", iconName: "storefront", sortOrder: 2, isActive: true },
  { id: "cat_pharmacy", code: "pharmacy", nameAr: "صيدلية", nameEn: "Pharmacy", iconName: "medical-services", sortOrder: 3, isActive: true },
  { id: "cat_coffee", code: "coffee", nameAr: "قهوة", nameEn: "Coffee", iconName: "coffee", sortOrder: 4, isActive: true },
  { id: "cat_sweets", code: "sweets", nameAr: "حلويات", nameEn: "Sweets", iconName: "cake", sortOrder: 5, isActive: true },
];

async function seed() {
  console.log("Seeding restaurants...");
  await db.insert(restaurantsTable).values(restaurants).onConflictDoNothing();

  console.log("Seeding menu items...");
  await db.insert(menuItemsTable).values(menuItems).onConflictDoNothing();

  console.log("Seeding promo banners...");
  await db.insert(promoBannersTable).values(promoBanners).onConflictDoNothing();

  console.log("Seeding restaurant categories...");
  await db.insert(restaurantCategoriesTable).values(restaurantCategories).onConflictDoNothing();

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
