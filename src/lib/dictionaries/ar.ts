import type { PluralForms } from "@/lib/plural-forms";
import type { Dictionary } from "./en";

/**
 * Arabic dictionary.
 *
 * Two things make this more than a lookup table:
 *
 * 1. The six plural categories. `Intl.PluralRules("ar")` distinguishes zero,
 *    one, two, a "few" band (3-10), a "many" band (11-99) and "other". Getting
 *    this wrong is the single most visible way a translated app announces itself
 *    as machine-made, so the day, unit and noun forms are spelled out in full
 *    rather than reusing one string.
 *
 * 2. Placeholders are positional within the phrase, not the phrase around them.
 *    Arabic sentences routinely place the object before the verb, so
 *    "Save changes" becomes "حفظ التعديلات" and the label for a person becomes
 *    "عرض {name}" rather than a literal word-for-word transposition.
 *
 * TypeScript checks this object against `Dictionary`, so a key present in the
 * English file and missing here is a build failure rather than a stray English
 * label in front of a priest.
 */
const ar: Dictionary = {
  app: {
    name: "متابعة الاعتراف",
    titleTemplate: "%s · متابعة الاعتراف",
    description: "متابعة حضور الاعتراف ومواعيد الاستحقاق بشكل خاص.",
    tagline: "لوحة داخلية خاصة",
  },

  common: {
    cancel: "إلغاء",
    close: "إغلاق",
    back: "رجوع",
    next: "التالي",
    previous: "السابق",
    clear: "مسح",
    search: "بحث",
    loading: "جارٍ التحميل",
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    updating: "جارٍ التحديث…",
    none: "—",
    viewAll: "عرض الكل",
    required: "مطلوب",
  },

  nav: {
    primary: "التنقل الرئيسي",
    dashboard: "الرئيسية",
    members: "الأشخاص",
    settings: "الإعدادات",
    home: "الصفحة الرئيسية لمتابعة الاعتراف",
    signOut: "تسجيل الخروج",
  },

  shell: {
    privacyTitle: "مساحة عمل خاصة",
    privacyBody: "تواريخ فقط. لا تفاصيل اعتراف.",
    rolePriest: "كاهن",
    roleAdmin: "مدير الكنيسة",
    brandLineOne: "متابعة",
    brandLineTwo: "الاعتراف",
  },

  roles: {
    PRIEST: "كاهن",
    TENANT_ADMIN: "مدير الكنيسة",
  },

  status: {
    ACTIVE: "منتظم",
    DUE_SOON: "موعده قريب",
    OVERDUE: "متأخر",
    NEVER_RECORDED: "لا يوجد تسجيل",
  },

  filters: {
    all: "الكل",
    active: "منتظم",
    dueSoon: "موعده قريب",
    overdue: "متأخر",
    neverConfessed: "لم يعترف بعد",
    noPhone: "بدون رقم هاتف",
  },

  days: {
    zero: "{count} يوم",
    one: "يوم واحد",
    two: "يومان",
    few: "{count} أيام",
    many: "{count} يومًا",
    other: "{count} يوم",
  } as PluralForms,

  phrases: {
    overdue: "متأخر {days}",
    remaining: "متبقٍ {days}",
    dueIn: "موعده خلال {days}",
    lastPrefix: "الأخير: {date}",
    pageOf: "صفحة {current} من {total}",
    daysCount: "{count} تسجيل",
    intervalDays: "{count} يوم",
    dueSoonWithin: "خلال {count} يوم من الموعد",
    defaultIntervalHint: "اترك المدة فارغة ليُتبع الافتراضي وهو {count} يوم.",
    resultCount: "{count} {noun}",
    resultCountMatching: "{count} {noun} مطابق لـ «{query}»",
  },

  nouns: {
    member: {
      zero: "لا أشخاص",
      one: "شخص واحد",
      two: "شخصان",
      few: "{count} أشخاص",
      many: "{count} شخصًا",
      other: "{count} شخص",
    } as PluralForms,
  },

  units: {
    day: {
      zero: "يوم",
      one: "يوم",
      two: "يومان",
      few: "أيام",
      many: "يومًا",
      other: "يوم",
    } as PluralForms,
  },

  auth: {
    principles: "مبادئ الخصوصية",
    privacyNotice:
      "يسجّل هذا النظام التواريخ وبيانات التواصل الإدارية فقط، ولا يقبل ولا يخزّن أي محتوى للاعتراف.",

    signIn: {
      title: "تسجيل الدخول",
      eyebrow: "دخول المصرّح لهم فقط",
      heading: "أهلًا بعودتك",
      intro: "سجّل الدخول لتسجيل الحضور ومراجعة قوائم المتابعة.",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      submit: "تسجيل الدخول",
      pending: "جارٍ تسجيل الدخول…",
      forgot: "هل نسيت كلمة المرور؟",
      invite: "لديك كود دعوة؟",
    },

    register: {
      title: "إنشاء الحساب",
      eyebrow: "بالدعوة فقط",
      heading: "إنشاء حسابك",
      introExisting: "الكود الخاص بك يتيح لك الدخول إلى مساحة عمل قائمة.",
      introNew: "الكود الخاص بك سيُنشئ لك مساحة عمل خاصة جديدة.",
      introNone: "أدخل كود الدعوة الذي وصلك للبدء.",
      code: "كود الدعوة",
      codeHint: "الكود الذي وصلك يحدد مساحة العمل التي ستنضم إليها.",
      tenantName: "اسم الكنيسة أو الأبرشية",
      name: "الاسم بالكامل",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      passwordHint:
        "‏12 حرفًا على الأقل، مع حرف كبير وحرف صغير ورقم ورمز.",
      submit: "إنشاء الحساب",
      pending: "جارٍ إنشاء حسابك…",
      haveAccount: "لديك حساب بالفعل؟",
      signIn: "تسجيل الدخول",
    },

    forgotPassword: {
      title: "إعادة تعيين كلمة المرور",
      eyebrow: "استعادة الحساب",
      heading: "إعادة تعيين كلمة المرور",
      intro:
        "أدخل بريدك الإلكتروني وسنرسل لك رابطًا لاختيار كلمة مرور جديدة. يعمل الرابط مرة واحدة فقط وينتهي بعد ساعة.",
      email: "البريد الإلكتروني",
      submit: "إرسال رابط الاستعادة",
      pending: "جارٍ الإرسال…",
      back: "العودة لتسجيل الدخول",
      privacy:
        "لا يحتوي البريد الذي نرسله على أي تفاصيل عن الحساب سوى وجوده، وإتمام الاستعادة يُنهي كل الجلسات الأخرى.",
    },

    resetPassword: {
      title: "اختيار كلمة مرور جديدة",
      eyebrow: "استعادة الحساب",
      heading: "اختيار كلمة مرور جديدة",
      intro:
        "تعيين كلمة مرور جديدة يُنهي كل الأجهزة الأخرى، بما فيها أي جلسة قد تكون مُخترقة.",
      password: "كلمة المرور الجديدة",
      passwordHint:
        "‏12 حرفًا على الأقل، مع حرف كبير وحرف صغير ورقم ورمز.",
      submit: "تعيين كلمة المرور",
      pending: "جارٍ التحديث…",
      privacy: "لا تُعرض كلمة المرور الحالية ولا تُرسل مرة أخرى أبدًا.",
      invalidEyebrow: "الرابط غير صالح",
      invalidHeading: "رابط الاستعادة ناقص",
      invalidBody:
        "الرابط الذي فتحته لا يحتوي على رمز استعادة. اطلب رابطًا جديدًا واستخدم أحدث رسالة تصلك.",
      requestNew: "طلب رابط جديد",
    },

    /**
     * مبادئ الخصوصية في كتالوج واحد.
     *
     * تعرض كل شاشات الدخول والاستعادة ثلاثة منها، والاختيار قرار تصميم لا
     * قرار ترجمة. تكرار الجملة نفسها بثلاث صيغ على أربع شاشات هو كيف يبدأ
     * التطبيق المترجم في أن يناقض نفسه، لذلك تُكتب كل مبدأ هنا مرة واحدة
     * وتختاره الشاشات بالمفتاح.
     */
    principlesContent: {
      minimalData: {
        title: "بيانات محدودة",
        body: "لا يُحفظ سوى الأسماء وبيانات التواصل والتواريخ والفترات.",
      },
      dateOnly: {
        title: "سجل تواريخ فقط",
        body: "لا يوجد أي حقل للخطايا أو الإرشاد أو الملاحظات الخاصة.",
      },
      protected: {
        title: "وصول محمي",
        body: "تحمي الجلسات الآمنة وأحداث التدقيق الإدارية النشاط.",
      },
      privateByDefault: {
        title: "الخصوصية افتراضيًا",
        body: "مساحة عملك غير مرئية لأي كاهن آخر على المنصة.",
      },
      singleUse: {
        title: "استخدام واحد",
        body: "يعمل الرابط مرة واحدة ثم يتوقف فورًا.",
      },
      singleUseInvite: {
        title: "استخدام واحد",
        body: "كل كود دعوة يعمل مرة واحدة ثم ينتهي.",
      },
      shortLived: {
        title: "مدة قصيرة",
        body: "تنتهي صلاحية الروابط بعد ساعة من إصدارها.",
      },
      fullSignOut: {
        title: "إنهاء كامل",
        body: "إتمام الاستعادة يُنهي كل الجلسات الموجودة على كل الأجهزة.",
      },
      noDisclosure: {
        title: "بدون كشف",
        body: "يُعرض الرد نفسه سواء كان الحساب موجودًا أو غير موجود.",
      },
      storedHashed: {
        title: "مخزّن مشفّرًا",
        body: "لا تُحفظ روابط الاستعادة إلا كبصمة مشفّرة، لا كنص صريح.",
      },
      strongPasswords: {
        title: "كلمات مرور قوية",
        body: "مخزّنة بخوارزمية Argon2id، وليست أبدًا كنص صريح.",
      },
      immediateEffect: {
        title: "أثر فوري",
        body: "تنتهي كل الجلسات الأخرى لحظة تعيين كلمة المرور الجديدة.",
      },
      thenSignIn: {
        title: "ثم سجّل الدخول",
        body: "استخدم كلمة المرور الجديدة للعودة إلى مساحة عملك.",
      },
    },
  },

  dashboard: {
    eyebrow: "نظرة عامة على الحضور",
    title: "الرئيسية",
    description: "اليوم {date} · التواريخ والأوقات محسوبة حسب {timezone}.",
    addMember: "إضافة شخص",
    saved: "تم حفظ الشخص بنجاح.",
    updated: "تم تحديث بيانات الشخص بنجاح.",
    activityLabel: "نشاط الاعتراف",
    thisWeek: "هذا الأسبوع",
    thisMonth: "هذا الشهر",
    confessionsRecorded: "اعتراف مسجّل",
    activityNote:
      "إحصاءات النشاط تحتوي على تواريخ فقط، وهي للاسترشاد لا للحكم.",
    needsAttention: "يحتاجون متابعة",
    needsAttentionBody:
      "المتأخرون يظهرون أولًا، مرتّبين حسب أطول مدة تأخير.",
    overdueBody: "تجاوز الحد المُحدَّد",
    dueSoonBody: "خلال {count} يوم من الموعد",
    neverRecorded: "لم يُسجَّل",
    neverRecordedBody: "لا يوجد تاريخ اعتراف مسجّل",
    privacyHeading: "الخصوصية في التصميم",
    privacyBody:
      "لا يحتوي قاعدة البيانات على أي حقل لمحتوى الاعتراف أو الخطايا أو الإرشاد أو الملاحظات الروحية الخاصة. سجل كل شخص يُحفظ كتواريخ فقط.",

    stats: {
      label: "إحصاءات اللوحة",
      total: "إجمالي الأشخاص",
      totalBody: "السجل النشط",
      active: "منتظم",
      activeBody: "ضمن الموعد الحالي",
      dueSoon: "موعده قريب",
      dueSoonBody: "قارب على الموعد",
      overdue: "متأخر",
      overdueBody: "تجاوز الموعد",
      noRecord: "لا يوجد تسجيل",
      noRecordBody: "لم يُسجَّل أي تاريخ",
    },

    recent: {
      title: "المسجَّل حديثًا",
      body: "أحدث سجلات الحضور",
      recorded: "تم التسجيل",
      empty: "لم يُسجَّل أي اعتراف بعد.",
    },

    quick: {
      label: "إجراءات سريعة",
      eyebrow: "العمل اليومي",
      title: "إجراءات سريعة",
      addMember: "إضافة شخص",
      addMemberBody: "إنشاء سجل بتواريخ فقط",
      importMembers: "استيراد قائمة",
      importMembersBody: "حمِّل الأسماء من ملف جدول",
      record: "تسجيل اعتراف",
      recordBody: "ابحث عن شخص وأكّد الحضور",
      search: "بحث عن شخص",
      searchBody: "الاسم أو رقم الهاتف",
      viewOverdue: "عرض المتأخرين",
      viewOverdueBody: "المتابعة أولًا",
      viewDueSoon: "عرض القريبين من الموعد",
      viewDueSoonBody: "خطط مقدمًا",
      dialogEyebrow: "تسجيل سريع",
      dialogTitle: "من جاء اليوم؟",
      close: "إغلاق",
      placeholder: "ابحث بالاسم أو الهاتف",
      searchLabel: "البحث في الأشخاص",
      empty: "لا توجد نتائج.",
    },

    attention: {
      noConfessionDate: "لا يوجد تاريخ اعتراف",
      noAttendanceDate: "لا يوجد تاريخ حضور",
      whatsappTooltip: "تجهيز تذكير واتساب",
      whatsappLabel: "تجهيز تذكير واتساب لـ {name}",
      record: "تسجيل",
      emptyOverdue: "الجميع ضمن فترتهم الحالية.",
      emptyDueSoon: "لا يوجد أحد يقترب من حده الحالي.",
      emptyNeverRecorded: "كل شخص نشط لديه تاريخ اعتراف مسجّل.",
    },
  },

  /**
   * نصوص تخرج من النظام إلى المُراسِل نفسه، فتصل بلغته هو لا بلغة المُشغِّل.
   */
  whatsapp: {
    notRecorded: "غير مسجَّل",
    notAvailable: "غير متاح",
  },

  members: {
    heading: "الأشخاص",
    body: "ابحث وصفِّ وسجّل الحضور دون مغادرة الصفحة.",
    searchShortcutLabel: "اختصار البحث بالشرطة المائلة",
    searchShortcut: "اضغط {key} للبحث",
    searchPlaceholder: "ابحث بالاسم أو رقم الهاتف",
    searchLabel: "البحث في الأشخاص بالاسم أو رقم الهاتف",
    clearSearch: "مسح البحث",
    sort: "ترتيب",
    filterGroup: "تصفية الأشخاص",
    pageOf: "صفحة {current} من {total}",

    sortOptions: {
      attention: "الأكثر حاجة للمتابعة أولًا",
      nameAsc: "الاسم: أ ← ي",
      nameDesc: "الاسم: ي ← أ",
      lastDesc: "آخر اعتراف: الأحدث أولًا",
      lastAsc: "آخر اعتراف: الأقدم أولًا",
      sinceDesc: "عدد الأيام: الأكبر أولًا",
      sinceAsc: "عدد الأيام: الأصغر أولًا",
      dueAsc: "الموعد القادم: الأقرب أولًا",
      dueDesc: "الموعد القادم: الأبعد أولًا",
      status: "الحالة",
    },

    columns: {
      name: "الاسم",
      phone: "الهاتف",
      last: "آخر اعتراف",
      since: "عدد الأيام",
      limit: "المدة",
      nextDue: "الموعد القادم",
      status: "الحالة",
      actions: "إجراءات",
    },

    cardTime: "الوقت",
    custom: "مخصص",
    noPhone: "بدون هاتف",
    noPhoneLong: "لا يوجد رقم هاتف",
    viewLabel: "عرض {name}",
    viewTooltip: "تعديل أو عرض الشخص",
    record: "تسجيل",
    whatsapp: "واتساب",
    recordConfession: "تسجيل اعتراف",
    emptyTitleQuery: "لا توجد نتائج",
    emptyTitleNoQuery: "لا يوجد أشخاص في هذا العرض",
    emptyBodyQuery: "جرّب اسمًا أو رقم هاتف آخر، أو امسح عوامل التصفية الحالية.",
    emptyBodyNoQuery: "أضف شخصًا من الكنيسة أو اختر تصفية حالة أخرى.",
    clearAll: "مسح البحث والتصفية",

    drawer: {
      notFound: "الشخص غير موجود أو لم يعد متاحًا.",
      archiveConfirm: "أرشفة {name}؟ يمكن استعادة السجل لاحقًا.",
      loadingTitle: "بيانات الشخص",
      close: "إغلاق البيانات",
      loading: "جارٍ تحميل بيانات الشخص…",
      record: "تسجيل اعتراف",
      edit: "تعديل البيانات",
      whatsapp: "إرسال تذكير واتساب",
      summary: "ملخص بيانات الشخص",
      phone: "الهاتف",
      interval: "المدة",
      customInterval: "مدة مخصصة",
      systemDefault: "المدة الافتراضية",
      last: "آخر اعتراف",
      nextDue: "تاريخ الاستحقاق",
      daysSince: "عدد الأيام منذه",
      daysRemaining: "الأيام المتبقية",
      note: "ملاحظة إدارية",
      history: "سجل الاعترافات",
      historyEmpty: "لم يُسجَّل أي اعتراف بعد.",
      historyPrivacy:
        "السجل يحتوي على تواريخ الحضور فقط. لا يخزّن هذا النظام محتوى الاعتراف أو ملاحظات الإرشاد الخاصة.",
      archiveWarning: "الأرشفة تزيل هذا الشخص من اللوحة دون حذف بياناته.",
      archive: "أرشفة الشخص",
      archivePending: "جارٍ الأرشفة…",
    },

    recordDialog: {
      success: "تم تسجيل {name} بنجاح.",
      eyebrow: "تحديث الحضور",
      title: "تسجيل اعتراف {name}؟",
      body: "يُحفظ التاريخ فقط، ولا يُطلب أي تفاصيل عن الاعتراف.",
      close: "إغلاق النافذة",
      previous: "السابق",
      newDate: "التاريخ الجديد",
      selectDate: "اختر التاريخ",
      field: "تاريخ الاعتراف الجديد",
      duplicateWarning: "هذا التاريخ مسجّل بالفعل. اختر تاريخًا أبعد.",
      submit: "تأكيد وتسجيل",
      pending: "جارٍ التسجيل…",
    },

    form: {
      detailsTitle: "بيانات الشخص",
      detailsBody: "احفظ فقط البيانات اللازمة لمتابعة الحضور.",
      name: "الاسم بالكامل",
      phone: "رقم الهاتف",
      phonePlaceholder: "‎+20 100 123 4567",
      phoneHint: "من 7 إلى 15 رقمًا. يُفضَّل إضافة + للأرقام الدولية.",
      attendanceTitle: "إعدادات الحضور",
      attendanceBody: "اترك المدة فارغة ليُتبع الافتراضي وهو {count} يوم.",
      interval: "مدة مخصصة (أيام)",
      lastDate: "تاريخ آخر اعتراف",
      lastDateHint: "اختياري. لا يُسمح بتواريخ مستقبلية.",
      adminTitle: "معلومات إدارية",
      adminBody: "سياق جدولة أو تواصل اختياري فقط.",
      note: "ملاحظة إدارية",
      notePlaceholder: "مثال: يفضّل صباح يوم السبت",
      noteHint:
        "لا تُدرج محتوى الاعتراف أو الخطايا أو تفاصيل الإرشاد أو الملاحظات الدينية الخاصة.",
      privacyTitle: "تنبيه الخصوصية",
      privacyBody: "هذا النموذج لا يقبل ولا يخزّن محتوى الاعتراف.",
      save: "إضافة شخص",
      saveEdit: "حفظ التعديلات",
      saving: "جارٍ الحفظ…",
      updating: "جارٍ التحديث…",
    },

    archive: {
      restoreConfirm: "استعادة {name} إلى قائمة الأشخاص النشطين؟",
      deletePrompt:
        "حذف {name} نهائيًا؟ لا يمكن التراجع. اكتب {token} للتأكيد.",
      deleteToken: "حذف",
      deletePasswordPrompt:
        "أدخل كلمة مرور المدير الحالية لتأكيد الحذف النهائي.",
      emptyTitle: "لا يوجد أشخاص مؤرشفون",
      emptyBody: "ستظهر سجلات الأشخاص المؤرشفين هنا ويمكن استعادتها.",
      last: "آخر اعتراف",
      archived: "تاريخ الأرشفة",
      restore: "استعادة",
      delete: "حذف نهائي",
    },
  },

  /**
   * نموذج إضافة/تعديل الشخص.
   *
   * جملتا الخصوصية هنا ليستا زينة. هذه الشاشة الوحيدة التي يكتب فيها أحدهم اسم
   * أحد المخدومين، فحدود ما يجوز تدوينه وما لا يجوز يجب أن تُقال عند نقطة
   * الدخول نفسها، لا في صفحة سياسة لا يقرأها أحد.
   */
  memberForm: {
    details: "بيانات الشخص",
    detailsBody: "لا تُخزَّن إلا البيانات اللازمة لمتابعة الحضور.",
    name: "الاسم الكامل",
    phone: "رقم الهاتف",
    phonePlaceholder: "+20 100 123 4567",
    phoneHint: "استخدم من ٧ إلى ١٥ رقمًا. ويُنصح بعلامة + للأرقام الدولية.",
    attendance: "إعدادات الحضور",
    customInterval: "فترة مخصصة (بالأيام)",
    lastDate: "آخر تاريخ اعتراف",
    lastDateHint: "اختياري. لا تُقبل التواريخ المستقبلية.",
    admin: "بيانات إدارية",
    adminBody: "سياق اختياري للمواعيد أو التواصل فقط.",
    note: "ملاحظة إدارية",
    notePlaceholder: "مثال: يفضّل صباح السبت",
    noteHint:
      "لا تُدوَّن اعترافات أو خطايا أو تفاصيل الإرشاد أو ملاحظات دينية خاصة.",
    privacyTitle: "تذكير الخصوصية",
    privacyBody: "هذا النموذج لا يستقبل ولا يخزّن أي محتوى اعتراف.",
  },

  /**
   * استيراد قائمة الأشخاص.
   *
   * الغرض من النصوص هنا يتجاوز مجرد تسميات الأشياء: أن يعرف الكاهن بلا لبس أن
   * الملف يُقرأ في متصفّحه وأن عمود الاسم ورقم الهاتف فقط هما ما يغادر الجهاز.
   * الكاهن على وشك أن يسلّم قائمة مخدوميه لبرنامج، وأكثر جملة تُطمئنه هي التي
   * تقول ما الذي *لا* يغادر.
   */
  import: {
    pageTitle: "استيراد الأشخاص",
    pageEyebrow: "إدخال جماعي",
    pageBody:
      "حمِّل ملف جدول بالأسماء وأرقام الهواتف. يُقرأ الملف في متصفّحك؛ ولا يُرسَل إلى هذا الخادم سوى عمود الاسم وعمود الهاتف.",
    choose: "اختر ملفًا",
    change: "اختر ملفًا آخر",
    dropHere: "أو أفلت ملفًا هنا",
    accepted: "إكسل (‎.xlsx) أو نص مفصول بفواصل (‎.csv، ‎.txt).",
    notAccepted:
      "صيغة ‎.xls القديمة غير مدعومة. افتح الملف في إكسل واحفظه بصيغة ‎.xlsx.",
    fileTooLarge: "حجم هذا الملف أكبر من {max}.",
    unreadable: "تعذّرت قراءة هذا الملف كملف جدول بيانات.",
    reading: "جارٍ قراءة الملف…",
    privacyTitle: "ما الذي يغادر متصفّحك",
    privacyBody:
      "لا يُرسَل سوى عمود الاسم وعمود الهاتف. يُهمَل كل عمود آخر في الملف دون النظر إليه، ولا يُرفع الملف نفسه ولا يُخزَّن.",
    columns: "الأعمدة التي سيتم استيرادها",
    nameColumn: "الاسم",
    phoneColumn: "الهاتف",
    assumedColumns:
      "لم يطابق أي عنوان عمود اسمًا، لذلك يُستخدم أول عمودين. راجع المعاينة قبل الاستيراد.",
    noPhoneColumn: "لم يُعثر على عمود هاتف. ستُضاف الأشخاص دون أرقام.",
    previewTitle: "المعاينة",
    rowsFound: "تم العثور على {count} صف",
    willImport: "سيتم استيراد {count}",
    willSkip: "سيتم تخطي {count}",
    columnRow: "الصف",
    columnName: "الاسم",
    columnPhone: "الهاتف",
    columnOutcome: "النتيجة",
    outcomeReady: "سيتم استيراده",
    summaryTitle: "تم الاستيراد",
    importedOne: "تمت إضافة شخص واحد.",
    importedMany: "تمت إضافة {count} أشخاص.",
    skippedOne: "تم تخطي صف واحد.",
    skippedMany: "تم تخطي {count} صف.",
    skippedHeading: "الصفوف المتخطاة",
    skipRow: "الصف {row}",
    duplicatesNote: "{count} منها يطابق شخصًا موجودًا بالفعل في القائمة.",
    nothingImported: "لم تتم إضافة أي شخص. تم تخطي كل صفوف الملف.",
    startOver: "استيراد ملف آخر",
    goToMembers: "عرض قائمة الأشخاص",
    confirmTitle: "قبل الاستيراد",
    confirmBody:
      "راجع المعاينة. بمجرد إضافة الصف يبقى في القائمة حتى يؤرشفه أحد أو يحذفه — والاستيراد الثاني لا يُلغي الأول.",
    submit: "استيراد {count} شخص",
    submitting: "جارٍ الاستيراد…",
    noPhoneHint:
      "يمكن متابعة الشخص الذي بلا رقم هاتف؛ لكنه ببساطة لن يصله تذكير.",
  },

  pages: {
    addMemberTitle: "إضافة شخص",
    addMemberEyebrow: "سجل الكنيسة",
    addMemberBody: "أنشئ سجل حضور بالحد الأدنى. لا يُطلب أي بيان خاص.",
    editMemberTitle: "تعديل بيانات شخص",
    editMemberEyebrow: "سجل شخص",
    editMemberTitleWithName: "تعديل {name}",
    editMemberBody: "تغيير المدة يعيد حساب تاريخ الاستحقاق والحالة فورًا.",
    settingsTitle: "الإعدادات",
    settingsEyebrow: "أدوات مساحة العمل",
    settingsBody: "اضبط قواعد المتابعة ونص التذكير وأمان الحساب والتحكم في البيانات.",
    viewArchived: "عرض الأشخاص المؤرشفين",
    archivedTitle: "الأشخاص المؤرشفون",
    archivedEyebrow: "دورة حياة السجل",
    archivedBody:
      "السجلات المؤرشفة مخفية من اللوحة لكنها تبقى قابلة للاستعادة حتى الحذف النهائي.",
    backToSettings: "العودة للإعدادات",
    archiveHeading: "أرشيف بالبيانات المحدودة",
    archiveBody:
      "استعادة الشخص تُعيد تواريخه وإعداداته التشغيلية إلى القائمة النشطة. أما الحذف النهائي فيتطلب كلمة مرور المدير الحالية ويزيل أيضًا سجل التواريخ المرتبط بهذا السجل.",
  },

  settings: {
    general: "عام",
    generalBody: "قواعد المتابعة الافتراضية وطريقة التعامل مع التواريخ.",
    defaultInterval: "المدة الافتراضية (أيام)",
    dueSoonThreshold: "حد التنبيه القريب (أيام)",
    timezone: "المنطقة الزمنية",
    dateFormat: "صيغة التاريخ",
    whatsapp: "تذكير واتساب",
    whatsappBody: "جهّز رسالة للمراجعة والإرسال اليدوي. النص الافتراضي خالٍ من التواريخ.",
    countryCode: "مفتاح الدولة الافتراضي",
    countryCodeHint: "يُستخدم عندما يبدأ الرقم المحلي بـ 0 ومن دون علامة +.",
    preview: "معاينة",
    previewEmpty: "ستظهر معاينة رسالتك هنا.",
    previewNote: "تستخدم المعاينة بيانات تجريبية ولا تُرسل تلقائيًا.",
    template: "نص الرسالة",
    defaultTemplate:
      "سلام {{name}}، هذه رسالة تذكير لطيفة من فريق متابعة الحضور. نتشرف بتواصلك في الوقت المناسب. ربنا يبارك لك.",
    insertPlaceholder: "إدراج متغيّر في نص الرسالة",
    templateHint:
      "يجب أن يحتوي النص على {nameToken} ولا يجوز أن يتضمن تفاصيل روحية حساسة. متغيّرات التاريخ اختيارية: عند وجودها تُوضع الرسالة داخل رابط واتساب خارجي وتكون مرئية لمزود الخدمة عندما يفتحها المشغّل.",
    data: "البيانات",
    dataBody: "صدّر فقط الحقول اللازمة للنسخ الاحتياطي التشغيلي.",
    roster: "سجل الأشخاص النشطين CSV",
    rosterBody:
      "يصدّر الأشخاص النشطين مع الاسم والهاتف وآخر تاريخ والمدة وتاريخ الاستحقاق والحالة. هذا ليس نسخة احتياطية من قاعدة البيانات.",
    backup: "نسخة احتياطية مشفّرة لقاعدة البيانات",
    backupBody:
      "تُؤخذ النسخ الاحتياطية من مزوّد قاعدة البيانات ولا تُنزَّل من هذه الصفحة. اطلب من المشغّل التأكد من تفعيل النسخ المشفّرة، ومن تحديد مدة احتفاظ، ومن أن الاستعادة قد جُرِّبت فعلًا — فالنسخة غير المجرَّبة افتراض لا نسخة احتياطية. رفع نسخة من المتصفح متعمَّد التعطيل لتقليل التعرّض.",
    applyNote: "تُطبَّق التغييرات على كل الأشخاص الذين يستخدمون الإعداد الافتراضي.",
    save: "حفظ الإعدادات",
    saving: "جارٍ حفظ الإعدادات…",
    saved: "تم حفظ الإعدادات.",

    export: {
      confirm:
        "تصدير سجل الأشخاص النشطين؟ يحتوي ملف CSV على بيانات التواصل وتواريخ الحضور.",
      error: "تعذّر تصدير الأشخاص.",
      success: "تم تنزيل سجل الأشخاص النشطين.",
      submit: "تصدير الأشخاص CSV",
      pending: "جارٍ تجهيز التصدير…",
      /**
       * رؤوس أعمدة الملف المُنزَّل. تتبع لغة القارئ لأن الملف يُقرأ في برنامج
       * جداول لا داخل هذا التطبيق، فرأس إنجليزي يكون غريبًا على من عليه مطابقته
       * بسجل الكنيسة.
       */
      columns: {
        name: "الاسم",
        phone: "رقم الهاتف",
        lastDate: "آخر تاريخ اعتراف (YYYY-MM-DD)",
        interval: "الفترة (بالأيام)",
        nextDue: "تاريخ الاستحقاق التالي (YYYY-MM-DD)",
        status: "الحالة",
      },
    },

    language: {
      label: "لغة الواجهة",
      en: "English",
      ar: "العربية",
      note: "يُطبَّق على حسابك في هذا الجهاز وفي أي جهاز آخر.",
      signedOutNote: "يُحفظ في هذا المتصفح حتى تسجّل الدخول.",
    },
  },

  security: {
    section: "الأمان",
    sectionBody: "التحكم في كلمة المرور والجلسات النشطة.",
    changeTitle: "تغيير كلمة المرور",
    changeBody: "تغيير كلمة المرور يُنهي كل الجلسات النشطة الأخرى.",
    currentPassword: "كلمة المرور الحالية",
    newPassword: "كلمة المرور الجديدة",
    passwordHint:
      "‏12 حرفًا على الأقل، مع حروف كبيرة وصغيرة ورقم ورمز.",
    change: "تغيير كلمة المرور",
    changing: "جارٍ التغيير…",
    sessionsTitle: "الجلسات النشطة",
    sessionsBody: "تنتهي صلاحية الجلسات تلقائيًا بعد سبعة أيام.",
    thisDevice: "هذا الجهاز",
    anotherDevice: "جهاز آخر",
    current: "الحالية",
    signedIn: "تم تسجيل الدخول {date}",
    expires: "تنتهي {date}",
    revoke: "إنهاء",
    revoking: "جارٍ الإنهاء…",
    revoked: "تم إنهاء الجلسة.",
  },

  audit: {
    title: "النشاط الإداري",
    body: "آخر 25 إجراء. لا تُسجَّل أسماء أو تفاصيل اعتراف.",
    colAction: "الإجراء",
    colUser: "المستخدم",
    colMember: "معرّف الشخص",
    colTime: "الوقت",
    unknownAction: "إجراء إداري",
    formerUser: "مستخدم سابق",
    empty: "لم تُسجَّل أي إجراءات إدارية بعد.",
    actions: {
      MEMBER_CREATED: "إضافة شخص",
      MEMBER_UPDATED: "تعديل بيانات شخص",
      MEMBERS_IMPORTED: "استيراد قائمة أشخاص",
      CONFESSION_RECORDED: "تسجيل تاريخ اعتراف",
      MEMBER_ARCHIVED: "أرشفة شخص",
      MEMBER_RESTORED: "استعادة شخص",
      MEMBER_PERMANENTLY_DELETED: "حذف شخص نهائيًا",
      SETTINGS_UPDATED: "تحديث الإعدادات",
      PASSWORD_CHANGED: "تغيير كلمة المرور",
      SESSION_REVOKED: "إنهاء جلسة",
      DATA_EXPORTED: "تصدير CSV",
      TENANT_CREATED: "إعادة تعيين حساب",
      INVITE_REDEEMED: "استخدام كود دعوة",
      MEMBER_INVITED: "دعوة شخص",
    },
  },

  dates: {
    noRecord: "لا يوجد تسجيل",
  },

  success: {
    recorded: "تم تسجيل الاعتراف.",
    archived: "تمت أرشفة الشخص.",
    restored: "تمت استعادة الشخص.",
    deleted: "تم الحذف النهائي للشخص.",
    passwordChanged: "تم تغيير كلمة المرور، وتم إنهاء الجلسات الأخرى.",
    sessionRevoked: "تم إنهاء الجلسة.",
    settingsSaved: "تم حفظ الإعدادات.",
    resetSent:
      "إذا كان يوجد حساب بهذا العنوان فرابط الاستعادة في الطريق إليك. تنتهي صلاحيته بعد ساعة.",
    localeChanged: "تم تحديث اللغة.",
  },

  errors: {
    invalidDate: "تاريخ غير صالح.",
    futureDate: "لا يمكن أن يكون تاريخ الاعتراف في المستقبل.",
    archivedDuplicate:
      "يوجد شخص مؤرشف مطابق بالفعل. استعد ذلك السجل أو عدّله.",
    activeDuplicate: "يوجد بالفعل شخص بهذا الاسم ورقم الهاتف.",
    cannotAdd: "لا يمكنك إضافة أشخاص.",
    cannotEdit: "لا يمكنك تعديل الأشخاص.",
    cannotRecord: "لا يمكنك تسجيل الحضور.",
    cannotArchive: "لا يمكنك أرشفة الأشخاص.",
    cannotRestore: "لا يمكنك استعادة الأشخاص.",
    adminOnlyDelete: "حذف الشخص نهائيًا متاح لمدير الكنيسة فقط.",
    passwordRequired: "كلمة المرور الحالية مطلوبة.",
    passwordIncorrect: "كلمة المرور الحالية غير صحيحة.",
    archiveOnlyDelete: "يمكن حذف الأشخاص المؤرشفين فقط.",
    memberNotFound: "الشخص غير موجود.",
    activeMemberNotFound: "الشخص النشط غير موجود.",
    archivedMemberNotFound: "الشخص المؤرشف غير موجود.",
    duplicateDate: "يوجد اعتراف مسجّل بالفعل في هذا التاريخ.",
    outOfOrder: "لا يمكن أن يسبق التاريخ الجديد آخر اعتراف مسجّل.",
    saveMember: "تعذّر حفظ الشخص. حاول مرة أخرى.",
    updateMember: "تعذّر تحديث بيانات الشخص. حاول مرة أخرى.",
    recordConfession: "تعذّر تسجيل الاعتراف. حاول مرة أخرى.",
    archiveMember: "تعذّرت أرشفة الشخص. حاول مرة أخرى.",
    restoreMember: "تعذّرت استعادة الشخص. حاول مرة أخرى.",
    deleteMember: "تعذّر الحذف النهائي للشخص. حاول مرة أخرى.",
    invalidCredentials:
      "البريد الإلكتروني أو كلمة المرور غير صحيحة. حاول لاحقًا إذا استمرت المشكلة.",
    sessionExpired: "انتهت صلاحية جلستك.",
    changePassword: "تم تغيير كلمة المرور. وتم إنهاء الجلسات الأخرى.",
    revokeSession: "تعذّر إنهاء هذه الجلسة.",
    sessionNotFound: "الجلسة غير موجودة أو انتهت صلاحيتها بالفعل.",
    createAccount: "تعذّر إنشاء الحساب. حاول مرة أخرى.",
    emailTaken: "يوجد حساب بهذا البريد الإلكتروني بالفعل.",
    resetSent:
      "إذا كان يوجد حساب بهذا العنوان فرابط الاستعادة في الطريق إليك. تنتهي صلاحيته بعد ساعة.",
    resetInvalid: "رابط الاستعادة غير صالح أو انتهت صلاحيته.",
    inviteInvalid: "كود الدعوة غير صالح.",
    inviteExpired: "انتهت صلاحية كود الدعوة.",
    inviteUsed: "تم استخدام كود الدعوة بالفعل.",
    adminOnlyInvite: "دعوة الآخرين متاحة لمدير الكنيسة فقط.",
    unknownRole: "دور غير معروف.",
    inviteNotFound: "الدعوة غير موجودة.",
    adminOnly: "هذا الإجراء متاح لمدير الكنيسة فقط.",
    crossOriginExport: "طلبات التصدير من مصادر خارجية غير مسموح بها.",
    authRequired: "تسجيل الدخول مطلوب.",
    exportAccessRequired: "صلاحية التصدير مطلوبة.",
    rosterTooLarge:
      "سجل الأشخاص النشطين محدود بـ {count} صف. صفِّ القائمة قبل التصدير.",
    exportPostOnly: "استخدم POST لتصدير سجل الأشخاص النشطين.",
    importTooLarge:
      "الاستيراد الواحد محدود بـ {max} صف. قسِّم الملف واستورده على أجزاء.",
    importEmpty: "لا يحتوي الملف على أي صف للاستيراد.",
    importUnreadable: "تعذّرت قراءة هذا الملف كملف جدول بيانات.",
    invalidInput: "إدخال غير صالح",
  },

  validation: {
    phoneInvalid: "رقم الهاتف غير صالح",
    passwordMin: "استخدم 12 حرفًا على الأقل",
    passwordLower: "أضف حرفًا صغيرًا",
    passwordUpper: "أضف حرفًا كبيرًا",
    passwordNumber: "أضف رقمًا",
    passwordSymbol: "أضف رمزًا",
    inviteRequired: "كود الدعوة مطلوب",
    nameRequired: "الاسم بالكامل مطلوب",
    timezoneInvalid: "منطقة زمنية غير صالحة",
    countryCodeInvalid: "مفتاح الدولة غير صالح",
    templateRequired: "نص الرسالة مطلوب",
    unknownPlaceholder: "متغيّر غير معروف: {token}",
    templateNeedsName: "يجب أن يحتوي النص على {nameToken}",
    thresholdTooHigh: "حد التنبيه القريب يجب أن يكون أقل من المدة الافتراضية",
    passwordSame: "يجب أن تكون كلمة المرور الجديدة مختلفة",
    emailInvalid: "بريد إلكتروني غير صالح",
    tooLong: "يجب ألا يزيد على {max} حرف",
    tooShort: "يجب ألا يقل عن {min} حرف",
    nameTooLong: "الاسم طويل جدًا",
    duplicateInFile: "موجود في هذه القائمة بالفعل",
  },
};

export default ar;
