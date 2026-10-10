export const navigationGroups = [
  {
    "id": "live",
    "label": "المتابعة المباشرة",
    "description": "صورة واضحة عن التشغيل الآن",
    "icon": "Activity",
    "items": [
      {
        "href": "/",
        "label": "لوحة التحكم"
      },
      {
        "href": "/live-map",
        "label": "الخريطة الحية"
      }
    ]
  },
  {
    "id": "orders",
    "label": "الطلبات",
    "description": "متابعة الطلب من إنشائه إلى التسليم",
    "icon": "Package",
    "items": [
      {
        "href": "/orders",
        "label": "الطلبات"
      },
      {
        "href": "/chats",
        "label": "المحادثات"
      },
      {
        "href": "/cancellation",
        "label": "تحليل الإلغاءات"
      }
    ]
  },
  {
    "id": "restaurants",
    "label": "المطاعم",
    "description": "الشركاء وقوائمهم وأداؤهم",
    "icon": "Building2",
    "items": [
      {
        "href": "/restaurants",
        "label": "المطاعم"
      },
      {
        "href": "/restaurant-accounts",
        "label": "حسابات المطاعم"
      },
      {
        "href": "/restaurant-performance",
        "label": "أداء المطاعم"
      }
    ]
  },
  {
    "id": "drivers",
    "label": "السائقون",
    "description": "التوافر والأداء والاشتراكات",
    "icon": "Bike",
    "items": [
      {
        "href": "/couriers",
        "label": "المندوبون"
      },
      {
        "href": "/courier-applications",
        "label": "طلبات الانضمام"
      },
      {
        "href": "/subscription-requests",
        "label": "طلبات الاشتراك"
      },
      {
        "href": "/subscriptions",
        "label": "الاشتراكات"
      },
      {
        "href": "/courier-performance",
        "label": "أداء السائقين"
      }
    ]
  },
  {
    "id": "customers",
    "label": "العملاء والدعم",
    "description": "حسابات العملاء ومتابعة استفساراتهم",
    "icon": "Headphones",
    "items": [
      {
        "href": "/users",
        "label": "المستخدمون"
      },
      {
        "href": "/customer-support",
        "label": "دعم العملاء"
      },
      {
        "href": "/churn",
        "label": "العملاء الغائبون"
      },
      {
        "href": "/customer-subscriptions",
        "label": "اشتراكات العملاء"
      }
    ]
  },
  {
    "id": "marketing",
    "label": "التسويق وواجهة التطبيق",
    "description": "المحتوى والحملات والعروض",
    "icon": "Sparkles",
    "items": [
      {
        "href": "/content",
        "label": "المحتوى"
      },
      {
        "href": "/restaurant-order",
        "label": "ترتيب المطاعم"
      },
      {
        "href": "/home-sections",
        "label": "أقسام الرئيسية"
      },
      {
        "href": "/categories",
        "label": "التصنيفات"
      },
      {
        "href": "/promos",
        "label": "أكواد الخصم"
      },
      {
        "href": "/flash-deals",
        "label": "عروض فلاش"
      },
      {
        "href": "/loyalty",
        "label": "نقاط الولاء"
      },
      {
        "href": "/referrals",
        "label": "الإحالات والمحافظ"
      },
      {
        "href": "/notifications",
        "label": "الإشعارات"
      }
    ]
  },
  {
    "id": "reports",
    "label": "التقارير والمالية",
    "description": "الأداء والإيرادات والتقييمات",
    "icon": "TrendingUp",
    "items": [
      {
        "href": "/financial",
        "label": "التقارير المالية"
      },
      {
        "href": "/ratings",
        "label": "التقييمات"
      }
    ]
  },
  {
    "id": "settings",
    "label": "الإعدادات والصلاحيات",
    "description": "إعدادات التشغيل وقنوات التواصل",
    "icon": "Settings",
    "items": [
      {
        "href": "/work-zones",
        "label": "مناطق العمل"
      },
      {
        "href": "/coverage-area",
        "label": "منطقة التغطية"
      },
      {
        "href": "/delivery-zones",
        "label": "نطاقات التوصيل"
      },
      {
        "href": "/whatsapp",
        "label": "واتساب"
      },
      {
        "href": "/settings",
        "label": "الإعدادات"
      }
    ]
  }
] as const;

export function findNavigation(path: string) {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  for (const group of navigationGroups) {
    const item = group.items.find(item => item.href === clean);
    if (item) return { group, item };
  }
  return null;
}
export function searchNavigation(query: string) {
  const normalize = (value: string) => value.normalize("NFKD").replace(/[\u064b-\u065f\u0670]/g, "").replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").trim().toLowerCase();
  const term = normalize(query);
  return term ? navigationGroups.flatMap(group => group.items.map(item => ({...item, groupLabel: group.label}))).filter(item => normalize(item.label+" "+item.groupLabel).includes(term)) : [];
}
