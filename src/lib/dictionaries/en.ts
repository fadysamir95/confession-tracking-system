import type { PluralForms } from "@/lib/i18n";

/**
 * The English dictionary. It is the structural source of truth: `ar.ts` is
 * typed against `Dictionary`, so a key added here and forgotten there is a
 * compile error rather than an English string leaking into the Arabic UI.
 *
 * `{name}`-style holes are filled by the `fill()` helper, not by string
 * concatenation, so that languages which reorder a phrase can move the
 * placeholder freely.
 */
const en = {
  app: {
    name: "Confession Attendance",
    titleTemplate: "%s · Confession Attendance",
    description: "Private confession attendance and due-date tracking.",
    tagline: "Private internal dashboard",
  },

  common: {
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    next: "Next",
    previous: "Previous",
    clear: "Clear",
    search: "Search",
    loading: "Loading",
    save: "Save",
    saving: "Saving…",
    updating: "Updating…",
    none: "—",
    viewAll: "View all",
    required: "Required",
  },

  nav: {
    primary: "Primary navigation",
    dashboard: "Dashboard",
    members: "Members",
    settings: "Settings",
    home: "Confession Attendance home",
    signOut: "Sign out",
  },

  shell: {
    rolePriest: "Priest",
    roleAdmin: "Tenant administrator",
    brandLineOne: "Confession",
    brandLineTwo: "Attendance",
  },

  roles: {
    PRIEST: "Priest",
    TENANT_ADMIN: "Tenant administrator",
  },

  /**
   * The three states are named after the member's limit, not after an
   * appointment. Nothing here is scheduled: what the system tracks is how long
   * it has been, and a word like "active" says nothing about that.
   */
  status: {
    ACTIVE: "Within limit",
    DUE_SOON: "Nearing limit",
    OVERDUE: "Limit exceeded",
    NEVER_RECORDED: "No record",
  },

  filters: {
    all: "All",
    active: "Within limit",
    dueSoon: "Nearing limit",
    overdue: "Limit exceeded",
    neverConfessed: "Never confessed",
    noPhone: "No phone number",
  },

  /** English only ever needs `one` and `other`; Arabic supplies the rest. */
  days: {
    one: "{count} day",
    other: "{count} days",
  } as PluralForms,

  phrases: {
    overdue: "{days} over the limit",
    remaining: "{days} remaining",
    dueIn: "Limit ends in {days}",
    lastPrefix: "Last: {date}",
    pageOf: "Page {current} of {total}",
    daysCount: "{count} recorded",
    intervalDays: "{count} days",
    dueSoonWithin: "Within {count} days of the limit",
    defaultIntervalHint: "Leave the interval blank to follow the system default of {count} days.",
    resultCount: "{count} {noun}",
    resultCountMatching: "{count} {noun} matching “{query}”",
  },

  nouns: {
    member: {
      one: "member",
      other: "members",
    } as PluralForms,
  },

  units: {
    day: {
      one: "day",
      other: "days",
    } as PluralForms,
  },

  auth: {
    privacyNotice:
      "This system records dates and administrative contact details only. It does not accept or store confession content.",

    signIn: {
      title: "Sign in",
      eyebrow: "Authorized access only",
      heading: "Welcome back",
      intro: "Sign in to record attendance and review follow-up lists.",
      email: "Email address",
      password: "Password",
      submit: "Sign in securely",
      pending: "Signing in…",
      forgot: "Forgot your password?",
      invite: "Have an invitation code?",
    },

    register: {
      title: "Create your account",
      eyebrow: "Invitation only",
      heading: "Create your account",
      introExisting: "Your code grants access to an existing workspace.",
      introNew: "Your code will create a new private workspace for you.",
      introNone: "Enter the invitation code you were given to begin.",
      code: "Invitation code",
      codeHint: "The code you were given decides which workspace you join.",
      tenantName: "Name of your church or parish",
      name: "Full name",
      email: "Email address",
      password: "Password",
      passwordHint:
        "At least 12 characters, with an uppercase letter, a lowercase letter, a number and a symbol.",
      submit: "Create account",
      pending: "Creating your account…",
      haveAccount: "Already have an account?",
      signIn: "Sign in",
    },

    forgotPassword: {
      title: "Reset your password",
      eyebrow: "Account recovery",
      heading: "Reset your password",
      intro:
        "Enter your email address and we will send you a link to choose a new password. The link can be used once and expires after an hour.",
      email: "Email address",
      submit: "Send reset link",
      pending: "Sending…",
      back: "Back to sign in",
      privacy:
        "The email we send contains no account details beyond the fact that an account exists, and completing a reset signs out every other device.",
    },

    resetPassword: {
      title: "Choose a new password",
      eyebrow: "Account recovery",
      heading: "Choose a new password",
      intro:
        "Setting a new password signs out every other device, including any session that may have been compromised.",
      password: "New password",
      passwordHint:
        "At least 12 characters, with an uppercase letter, a lowercase letter, a number and a symbol.",
      submit: "Set new password",
      pending: "Updating…",
      privacy: "Your existing password is never displayed or transmitted again.",
      invalidEyebrow: "Link not usable",
      invalidHeading: "This reset link is incomplete",
      invalidBody:
        "The link you followed did not include a reset token. Request a new one and use the most recent email you receive.",
      requestNew: "Request a new link",
    },
  },

  dashboard: {
    eyebrow: "Attendance overview",
    title: "Dashboard",
    description: "Today is {date} · Times and dates use {timezone}.",
    addMember: "Add member",
    saved: "Member saved successfully.",
    updated: "Member updated successfully.",
    activityLabel: "Confession activity",
    thisWeek: "This week",
    thisMonth: "This month",
    confessionsRecorded: "confessions recorded",
    activityNote:
      "Activity statistics contain dates only and are informational, not a judgment.",
    needsAttention: "Needs attention",
    needsAttentionBody:
      "Members past their limit appear first, longest past it at the top.",
    overdueBody: "Past the configured limit",
    dueSoonBody: "Within {count} days of the limit",
    neverRecorded: "Never recorded",
    neverRecordedBody: "No confession date on file",

    stats: {
      label: "Dashboard statistics",
      total: "Total members",
      totalBody: "Active directory",
      active: "Within limit",
      activeBody: "Has not passed the limit",
      dueSoon: "Nearing limit",
      dueSoonBody: "About to pass the limit",
      overdue: "Limit exceeded",
      overdueBody: "Past the limit",
      noRecord: "No record",
      noRecordBody: "No date recorded",
    },

    recent: {
      title: "Recently recorded",
      body: "Latest attendance entries",
      recorded: "Recorded",
      empty: "No confessions have been recorded yet.",
      /**
       * Hides the card. It never deletes anything: the six entries are a view of
       * real attendance dates, and a control sitting on a dashboard that wipes
       * irreplaceable records on one click is not a control worth having here.
       * `restore` exists because a dismissal with no way back is just a deletion
       * with extra steps.
       */
      clearAll: "Clear this card",
      clearAllLabel: "Hide the recently recorded card",
      restore: "Show recently recorded",
    },

    quick: {
      label: "Quick actions",
      eyebrow: "Daily workflow",
      title: "Quick actions",
      addMember: "Add member",
      addMemberBody: "Create a date-only record",
      importMembers: "Import a roster",
      importMembersBody: "Load names from a spreadsheet",
      record: "Record confession",
      recordBody: "Find someone and confirm",
      search: "Search member",
      searchBody: "Name or phone number",
      viewOverdue: "View over the limit",
      viewOverdueBody: "Follow up first",
      viewDueSoon: "View nearing the limit",
      viewDueSoonBody: "Plan ahead",
      dialogEyebrow: "Fast entry",
      dialogTitle: "Who came today?",
      close: "Close",
      placeholder: "Search by name or phone",
      searchLabel: "Search members",
      empty: "No members found.",
    },

    attention: {
      noConfessionDate: "No confession date",
      noAttendanceDate: "No attendance date",
      record: "Record",
      emptyOverdue: "Everyone is within their current confession interval.",
      emptyDueSoon: "No members are approaching their current limit.",
      emptyNeverRecorded: "Every active member has a recorded confession date.",
    },
  },

  /**
   * Copy that travels *outward*: it is substituted into the reminder a parish
   * sends to a parishioner, and unlike the rest of the interface it arrives in
   * somebody's own language rather than the operator's.
   */
  whatsapp: {
    notRecorded: "not recorded",
    notAvailable: "not available",
  },

  members: {
    heading: "Members",
    body: "Search, filter, and record attendance without leaving the page.",
    searchShortcutLabel: "Focus the member search",
    searchShortcutLead: "Press",
    searchShortcutTrail: "to search",
    searchPlaceholder: "Search by name or phone number",
    searchLabel: "Search members by name or phone number",
    clearSearch: "Clear search",
    sort: "Sort",
    filterGroup: "Filter members",
    pageOf: "Page {current} of {total}",

    sortOptions: {
      attention: "Needs attention first",
      nameAsc: "Name: A → Z",
      nameDesc: "Name: Z → A",
      lastDesc: "Last confession: newest first",
      lastAsc: "Last confession: oldest first",
      dueAsc: "Limit ends: soonest first",
      dueDesc: "Limit ends: latest first",
      status: "Status",
    },

    columns: {
      name: "Name",
      phone: "Phone",
      last: "Last confession",
      since: "Days since",
      limit: "Limit",
      nextDue: "Next due",
      status: "Status",
      actions: "Actions",
    },

    cardTime: "Time",
    custom: "Custom",
    noPhone: "No phone",
    noPhoneLong: "No phone number",
    viewLabel: "View {name}",
    viewTooltip: "Edit or view member",
    record: "Record",
    /**
     * Two WhatsApp links, and the difference between them is the point. The
     * reminder carries the parish's saved wording and is offered only to
     * someone past their limit, because the template states how many days late
     * they are — on anyone else it would say they were zero days overdue. The
     * plain link opens the chat empty and is offered to everyone with a number.
     */
    remind: "Remind",
    remindLabel: "Remind {name} using the saved message",
    remindTooltip: "Open WhatsApp with the saved reminder",
    whatsapp: "WhatsApp",
    whatsappLabel: "Open WhatsApp for {name} with no message",
    whatsappTooltip: "Open WhatsApp with no message",
    recordConfession: "Record confession",
    emptyTitleQuery: "No members found",
    emptyTitleNoQuery: "No members in this view",
    emptyBodyQuery:
      "Try a different name or phone number, or clear the current filters.",
    emptyBodyNoQuery:
      "Add a congregation member or choose another status filter.",
    clearAll: "Clear search and filters",

    drawer: {
      notFound: "Member not found or no longer available.",
      archiveConfirm: "Archive {name}? The record can be restored later.",
      loadingTitle: "Member details",
      close: "Close details",
      loading: "Loading member…",
      record: "Record confession",
      edit: "Edit member",
      remind: "Remind",
      remindLabel: "Remind {name} using the saved message",
      whatsapp: "WhatsApp",
      whatsappLabel: "Open WhatsApp for {name} with no message",
      summary: "Member summary",
      phone: "Phone",
      interval: "Interval",
      customInterval: "Custom interval",
      systemDefault: "System default",
      last: "Last confession",
      nextDue: "Next due date",
      daysSince: "Days since",
      daysRemaining: "Days remaining",
      note: "Administrative note",
      history: "Confession history",
      historyEmpty: "No confession has been recorded yet.",
      historyPrivacy:
        "History contains attendance dates only. This system does not store confession content or private counseling notes.",
      archiveWarning:
        "Archiving removes this member from the dashboard without deleting their data.",
      archive: "Archive member",
      archivePending: "Archiving…",
    },

    recordDialog: {
      success: "{name} was recorded successfully.",
      eyebrow: "Attendance update",
      title: "Record confession for {name}?",
      body: "Only the date is saved. No confession details are requested.",
      close: "Close dialog",
      previous: "Previous",
      newDate: "New date",
      selectDate: "Select date",
      field: "New confession date",
      duplicateWarning: "This date is already recorded. Choose a later date.",
      submit: "Confirm & record",
      pending: "Recording…",
    },

    form: {
      detailsTitle: "Member details",
      detailsBody: "Store only the information needed for attendance follow-up.",
      name: "Full name",
      phone: "Phone number",
      phonePlaceholder: "+20 100 123 4567",
      phoneHint:
        "Use 7–15 digits. A leading + is recommended for international numbers.",
      attendanceTitle: "Attendance settings",
      attendanceBody:
        "Leave the interval blank to follow the system default of {count} days.",
      interval: "Custom interval (days)",
      lastDate: "Last confession date",
      lastDateHint: "Optional. Future dates are not allowed.",
      adminTitle: "Administrative information",
      adminBody: "Optional scheduling or contact context only.",
      note: "Administrative note",
      notePlaceholder: "Example: prefers Saturday morning",
      noteHint:
        "Do not include confession content, sins, counseling details, or private religious notes.",
      privacyTitle: "Privacy reminder",
      privacyBody: "This form does not accept or store confession content.",
      save: "Add member",
      saveEdit: "Save changes",
      saving: "Saving…",
      updating: "Updating…",
    },

    archive: {
      restoreConfirm: "Restore {name} to the active member list?",
      deletePrompt:
        "Permanently delete {name}? This cannot be undone. Type {token} to confirm.",
      deleteToken: "DELETE",
      deletePasswordPrompt:
        "Enter your current administrator password to confirm permanent deletion.",
      emptyTitle: "No archived members",
      emptyBody: "Archived member records will appear here and remain recoverable.",
      last: "Last confession",
      archived: "Archived",
      restore: "Restore",
      delete: "Delete permanently",
    },
  },

  /**
   * The add/edit member form.
   *
   * The two privacy sentences here are not decoration. This is the only screen
   * where somebody types a parishioner's name into the system, so the boundary
   * between what may be written down and what may not has to be stated at the
   * point of entry rather than in a policy page nobody opens.
   */
  memberForm: {
    details: "Member details",
    detailsBody: "Store only the information needed for attendance follow-up.",
    name: "Full name",
    phone: "Phone number",
    phonePlaceholder: "+20 100 123 4567",
    phoneHint:
      "Use 7–15 digits. A leading + is recommended for international numbers.",
    attendance: "Attendance settings",
    customInterval: "Custom interval (days)",
    lastDate: "Last confession date",
    lastDateHint: "Optional. Future dates are not allowed.",
    admin: "Administrative information",
    adminBody: "Optional scheduling or contact context only.",
    note: "Administrative note",
    notePlaceholder: "Example: prefers Saturday morning",
    noteHint:
      "Do not include confession content, sins, counseling details, or private religious notes.",
    privacyTitle: "Privacy reminder",
    privacyBody: "This form does not accept or store confession content.",
  },

  /**
   * Bulk roster import.
   *
   * The copy here has one job beyond labelling things: making it unmistakable
   * that the file is read in the browser and that only a name and a phone
   * number ever leave it. A priest is about to hand a spreadsheet of their
   * congregation to a piece of software, and the most reassuring sentence on the
   * screen is the one that says what does not travel.
   */
  import: {
    pageTitle: "Import members",
    pageEyebrow: "Bulk entry",
    pageBody:
      "Load a spreadsheet of names and phone numbers. The file is read in your browser; only the name and phone columns are sent to this server.",
    choose: "Choose a file",
    change: "Choose a different file",
    dropHere: "or drop a file here",
    accepted: "Excel (.xlsx) or comma-separated text (.csv, .txt).",
    notAccepted:
      "The old .xls format is not supported. Open the file in Excel and save it as .xlsx.",
    fileTooLarge: "This file is larger than {max}.",
    unreadable: "This file could not be read as a spreadsheet.",
    reading: "Reading the file…",
    privacyTitle: "What leaves your browser",
    privacyBody:
      "Only the name and phone columns are sent. Every other column in the file is discarded without being looked at, and the file itself is never uploaded or stored.",
    columns: "Columns being imported",
    nameColumn: "Name",
    phoneColumn: "Phone",
    assumedColumns:
      "No column heading matched a name, so the first two columns are being used. Check the preview before importing.",
    noPhoneColumn: "No phone column was found. Members will be added without a number.",
    previewTitle: "Preview",
    rowsFound: "{count} rows found",
    willImport: "{count} will be imported",
    willSkip: "{count} will be skipped",
    columnRow: "Row",
    columnName: "Name",
    columnPhone: "Phone",
    columnOutcome: "Outcome",
    outcomeReady: "Will be imported",
    summaryTitle: "Import complete",
    importedOne: "1 member was added.",
    importedMany: "{count} members were added.",
    skippedOne: "1 row was skipped.",
    skippedMany: "{count} rows were skipped.",
    skippedHeading: "Skipped rows",
    skipRow: "Row {row}",
    duplicatesNote:
      "{count} of these matched a member who is already on the list.",
    nothingImported: "Nothing was added. Every row in the file was skipped.",
    startOver: "Import another file",
    goToMembers: "View the member list",
    confirmTitle: "Before you import",
    confirmBody:
      "Check the preview. Once a row is added it stays on the list until you archive or delete it — an import is not undone by a second import.",
    submit: "Import {count} members",
    submitting: "Importing…",
    noPhoneHint:
      "A member without a phone number can still be tracked; they simply cannot be sent a reminder.",
  },

  pages: {
    addMemberTitle: "Add member",
    addMemberEyebrow: "Congregation directory",
    addMemberBody: "Create a minimal attendance record. No confidential details are requested.",
    editMemberTitle: "Edit member",
    editMemberEyebrow: "Member record",
    editMemberTitleWithName: "Edit {name}",
    editMemberBody:
      "Changing the interval immediately recalculates the due date and status.",
    settingsTitle: "Settings",
    settingsEyebrow: "Workspace controls",
    settingsBody:
      "Configure follow-up rules, reminder copy, account security, and data controls.",
    viewArchived: "View archived members",
    archivedTitle: "Archived members",
    archivedEyebrow: "Member lifecycle",
    archivedBody:
      "Archived records are hidden from the dashboard but remain recoverable until permanently deleted.",
    backToSettings: "Back to settings",
    archiveHeading: "Minimal-data archive",
    archiveBody:
      "Restoring a member brings their dates and operational settings back to the active list. Permanent deletion requires the current administrator password and also removes the date history associated with that record.",
  },

  settings: {
    general: "General",
    generalBody: "Default follow-up rules and date handling.",
    defaultInterval: "Default interval (days)",
    dueSoonThreshold: "Nearing-limit threshold (days)",
    timezone: "Timezone",
    dateFormat: "Date format",
    whatsapp: "WhatsApp reminder",
    whatsappBody:
      "Prepare a message for manual review and sending. The default is date-free.",
    countryCode: "Default country code",
    countryCodeHint:
      "Used when a local number starts with 0 and has no + prefix.",
    preview: "Preview",
    previewEmpty: "Your message preview will appear here.",
    previewNote: "Preview uses sample data and is not sent automatically.",
    template: "Message template",
    /**
     * The copy a new tenant starts with. It is a dictionary entry rather than a
     * constant because the person creating the tenant is the person who will
     * read this message for years, and a parish in Cairo should not have to
     * delete an English default before it can write its own Arabic one.
     */
    defaultTemplate:
      "Hello {{name}}, this is a gentle reminder from the attendance team. Please contact us when convenient. God bless you.",
    insertPlaceholder: "Insert template placeholder",
    templateHint:
      "The template must include {nameToken} and may not include sensitive spiritual details. Date placeholders are opt-in: when present, the message is placed in a third-party WhatsApp URL and is visible to the provider when the operator opens it.",
    data: "Data",
    dataBody: "Export only the fields needed for operational backup.",
    roster: "Active-member CSV roster",
    rosterBody:
      "Exports active members with name, phone, last date, interval, next due date, and status. This is not a database backup.",
    backup: "Encrypted database backup",
    backupBody:
      "Backups are taken by your database provider and are not downloaded from this page. Ask the operator to confirm that encrypted backups are enabled, that a retention period is set, and that a restore has actually been tested — an untested backup is a hypothesis, not a backup. Browser backup upload is intentionally disabled to reduce exposure.",
    applyNote: "Changes apply to all members using the system default.",
    save: "Save settings",
    saving: "Saving settings…",
    saved: "Settings saved.",

    export: {
      confirm:
        "Export the active-member roster? The CSV contains contact and attendance dates.",
      error: "Unable to export members.",
      success: "Active-member roster downloaded.",
      submit: "Export members CSV",
      pending: "Preparing export…",
      /**
       * Column headings of the downloaded file. They follow the reader's
       * language because the file is read in a spreadsheet, not in this
       * application — a roster header row in English would be foreign to the
       * person who has to reconcile it against the parish register.
       */
      columns: {
        name: "Name",
        phone: "Phone",
        lastDate: "Last confession date (YYYY-MM-DD)",
        interval: "Interval (days)",
        nextDue: "Next due date (YYYY-MM-DD)",
        status: "Status",
      },
    },

    language: {
      label: "Interface language",
      en: "English",
      ar: "العربية",
      note: "Applies to your account on this and any other device.",
      // Signed out, nothing is stored on an account, so claiming otherwise here
      // would be a promise the page cannot keep. This variant says what is
      // actually true: the choice is remembered in this browser until sign-in.
      signedOutNote: "Remembered in this browser until you sign in.",
    },
  },

  security: {
    section: "Security",
    sectionBody: "Password and active session controls.",
    changeTitle: "Change password",
    changeBody: "Changing your password signs out every other active session.",
    currentPassword: "Current password",
    newPassword: "New password",
    passwordHint:
      "Use at least 12 characters with upper/lowercase letters, a number, and a symbol.",
    change: "Change password",
    changing: "Changing…",
    sessionsTitle: "Active sessions",
    sessionsBody: "Sessions expire automatically after seven days.",
    thisDevice: "This device",
    anotherDevice: "Another device",
    current: "Current",
    signedIn: "Signed in {date}",
    expires: "Expires {date}",
    revoke: "Revoke",
    revoking: "Revoking…",
    revoked: "Session revoked.",
  },

  audit: {
    title: "Administrative activity",
    body: "Latest 25 actions. No names or confession details are logged.",
    colAction: "Action",
    colUser: "User",
    colMember: "Member ID",
    colTime: "Time",
    unknownAction: "Administrative action",
    formerUser: "Former user",
    empty: "No administrative actions have been recorded yet.",
    actions: {
      MEMBER_CREATED: "Member created",
      MEMBER_UPDATED: "Member updated",
      MEMBERS_IMPORTED: "Roster imported",
      CONFESSION_RECORDED: "Confession date recorded",
      MEMBER_ARCHIVED: "Member archived",
      MEMBER_RESTORED: "Member restored",
      MEMBER_PERMANENTLY_DELETED: "Member permanently deleted",
      SETTINGS_UPDATED: "Settings updated",
      PASSWORD_CHANGED: "Password changed",
      SESSION_REVOKED: "Session revoked",
      DATA_EXPORTED: "CSV exported",
      TENANT_CREATED: "Account reset",
      INVITE_REDEEMED: "Invitation redeemed",
      MEMBER_INVITED: "Person invited",
    },
  },

  dates: {
    noRecord: "No record",
  },

  /**
   * Server-returned messages. They live here too rather than in the server files
   * so that one phrase has exactly one translation, and so that the language of
   * an error always matches the language of the form that produced it.
   */
  /**
   * Confirmations returned by a server action. They are as much part of the
   * interface as the labels are, and a priest working in Arabic should not see
   * an English "Done." after a successful save.
   */
  success: {
    recorded: "Confession recorded.",
    archived: "Member archived.",
    restored: "Member restored.",
    deleted: "Member permanently deleted.",
    passwordChanged: "Password changed. Other sessions were signed out.",
    sessionRevoked: "Session revoked.",
    settingsSaved: "Settings saved.",
    resetSent:
      "If an account exists for that address, a reset link is on its way. It expires in one hour.",
    localeChanged: "Language updated.",
  },

  errors: {
    invalidDate: "Invalid date.",
    futureDate: "Confession date cannot be in the future.",
    archivedDuplicate:
      "A matching archived member already exists. Restore or edit that record.",
    activeDuplicate: "A member with this name and phone number already exists.",
    cannotAdd: "You cannot add members.",
    cannotEdit: "You cannot edit members.",
    cannotRecord: "You cannot record attendance.",
    cannotArchive: "You cannot archive members.",
    cannotRestore: "You cannot restore members.",
    adminOnlyDelete:
      "Only a tenant administrator can permanently delete a member.",
    passwordRequired: "Current password is required.",
    passwordIncorrect: "Current password is incorrect.",
    archiveOnlyDelete: "Only archived members can be permanently deleted.",
    memberNotFound: "Member not found.",
    activeMemberNotFound: "Active member not found.",
    archivedMemberNotFound: "Archived member not found.",
    duplicateDate: "A confession is already recorded for this date.",
    outOfOrder:
      "The new date cannot be earlier than the latest recorded confession.",
    saveMember: "Unable to save member. Please try again.",
    updateMember: "Unable to update member. Please try again.",
    recordConfession: "Unable to record confession. Please try again.",
    archiveMember: "Unable to archive member. Please try again.",
    restoreMember: "Unable to restore member. Please try again.",
    deleteMember: "Unable to permanently delete member. Please try again.",
    invalidCredentials:
      "Invalid email or password. Try again later if the problem continues.",
    sessionExpired: "Your session has expired.",
    changePassword: "Password changed. Other sessions were signed out.",
    revokeSession: "Unable to revoke this session.",
    sessionNotFound: "Session not found or already expired.",
    createAccount: "Unable to create the account. Please try again.",
    emailTaken: "An account with this email address already exists.",
    resetSent:
      "If an account exists for that address, a reset link is on its way. It expires in one hour.",
    resetInvalid: "This reset link is invalid or has expired.",
    inviteInvalid: "This invitation code is not valid.",
    inviteExpired: "This invitation code has expired.",
    inviteUsed: "This invitation code has already been used.",
    adminOnlyInvite: "Only a tenant administrator can invite other people.",
    unknownRole: "Unknown role.",
    inviteNotFound: "Invitation not found.",
    adminOnly: "Only a tenant administrator can do that.",
    crossOriginExport: "Cross-origin export requests are not allowed.",
    authRequired: "Authentication required.",
    exportAccessRequired: "Export access is required.",
    rosterTooLarge:
      "The active-member roster is limited to {count} rows. Narrow the roster before exporting.",
    exportPostOnly: "Use POST to export the active-member roster.",
    importTooLarge:
      "A single import is limited to {max} rows. Split the file and import it in parts.",
    importEmpty: "The file contained no rows to import.",
    importUnreadable: "This file could not be read as a spreadsheet.",
    invalidInput: "Invalid input",
  },

  validation: {
    phoneInvalid: "Phone number is invalid",
    passwordMin: "Use at least 12 characters",
    passwordLower: "Add a lowercase letter",
    passwordUpper: "Add an uppercase letter",
    passwordNumber: "Add a number",
    passwordSymbol: "Add a symbol",
    inviteRequired: "An invitation code is required",
    nameRequired: "Full name is required",
    timezoneInvalid: "Invalid timezone",
    countryCodeInvalid: "Country code is invalid",
    templateRequired: "Message template is required",
    unknownPlaceholder: "Unknown placeholder: {token}",
    templateNeedsName: "The template must include {nameToken}",
    thresholdTooHigh:
      "The nearing-limit threshold must be less than the default interval",
    passwordSame: "New password must be different",
    emailInvalid: "Invalid email address",
    tooLong: "Must be at most {max} characters",
    tooShort: "Must be at least {min} characters",
    nameTooLong: "Name is too long",
    duplicateInFile: "Already on this list",
  },
};

export type Dictionary = typeof en;
export default en;
