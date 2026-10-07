/**
 * Storefront copy, English (source of truth).
 *
 * Every other language file is typed against `StorefrontCopy`, so a missing or
 * misspelled key is a build error rather than an English string leaking into a
 * translated storefront. Values are plain strings with `{placeholders}` — never
 * functions — because whole groups are handed to client components as props.
 */
export const en = {
  chrome: {
    shop: "Shop",
    currencyLabel: "Currency",
    currencyApply: "Set",
    basket: "Basket",
    basketWithCount: "Basket ({count})",
    basketClose: "Close the basket",
    operatedBy: "Operated by {client}. Printed on demand and shipped worldwide.",
    allProducts: "All products",
    orderStatus: "Order status",
    delivery: "Delivery",
    help: "Help",
    supportEmailLabel: "Email",
    supportPhoneLabel: "Phone",
    supportPending: "Support contact details have not been published yet.",
    carriersPending: "Carrier setup in progress",
    pricesShownIn: "Prices shown in {currency}{tax}.",
    taxIncluded: ", tax included",
    taxAtCheckout: ", tax added at checkout",
    legal:
      "© {year} {client}. {client} is the merchant of record for this store. Storefront powered by Parcelith.",
  },

  meta: {
    homeTitle: "{store} — made-to-order merchandise",
    homeDescription:
      "Shop {store}, the official store for {client}. Printed on demand and shipped worldwide.",
    taglineDescription:
      "{tagline} Shop {store}, the official store for {client}.",
    shopTitle: "Shop",
    shopDescription: "Every product available from {store}.",
  },

  home: {
    closedTitle: "This store is closed",
    closedBody:
      "{client} has archived {store}. Existing orders are still being fulfilled and their status pages remain available.",
    comingSoonTitle: "{store} is nearly ready",
    comingSoonBody: "The storefront layout has not been published yet.",
    comingSoonWithProducts: "Products are live and can be browsed in the meantime.",
    comingSoonNoProducts: "Check back shortly.",
    browseProducts: "Browse {count} products",
  },

  shop: {
    title: "Everything in the shop",
    intro: "Made to order and shipped worldwide. Prices in {currency}{tax}.",
    taxIncluded: ", tax included",
    taxAtCheckout: "; tax is added at checkout",
    searchLabel: "Search",
    searchPlaceholder: "Tee, hoodie, mug…",
    searchSubmit: "Search",
    clear: "Clear",
    filterByTag: "Filter by tag",
    emptyTitle: "Nothing published yet",
    emptyBody: "This store has not published any products yet. Check back soon.",
    noMatchTitle: "No products match that search",
    noMatchBody: "Try a different search term or clear the filters.",
    clearFilters: "Clear filters",
    personalise: "Personalise",
    previewSoon: "Preview coming soon",
  },

  product: {
    breadcrumb: "Breadcrumb",
    breadcrumbShop: "Shop",
    about: "About this product",
    madeToOrder: "Made to order",
    producedBy: "Produced by {supplier} in {lead}, then shipped with {carriers}.",
    defaultSupplier: "our production partner",
    leadDays: "{from}–{to} days",
    leadUnknown: "a few days",
    defaultCarrier: "our carrier",
    carrierJoin: "or",
    printDetail: "Print detail",
    printDetailBody: "{area}, {width} × {height} mm, printed at a minimum of {dpi} DPI.",
    taxAndDelivery: "Tax and delivery",
    pricesShownIn: "Prices shown in {currency}{tax}.",
    taxIncluded: " with tax included",
    taxAtCheckout: "; tax is calculated at checkout",
    merchantOfRecord: "{client} is the merchant of record for this order.",
  },

  purchase: {
    addToBasket: "Add to basket",
    adding: "Adding…",
    viewBasket: "View basket",
    colour: "Colour",
    size: "Size",
    option: "Option",
    required: "Required",
    quantity: "Quantity",
    lowStock: "low",
    noPreview: "No preview available",
    previewAlt: "{name} preview",
    viewAlt: "{view} view",
    livePreview:
      "Live preview. A production-accurate version is attached when you add this to the basket.",
    textPlaceholder: "Optional",
    textCounter: "{count}/{max} characters. Printed with the design.",
    artworkLabel: "Your own artwork",
    artworkHint:
      "Printed at {width} × {height} mm, so we need at least {dpi} DPI. {formats} up to {max} MB.",
    artworkHintSimple: "PNG, JPG or WEBP.",
    uploading: "Uploading your artwork…",
    uploadFailed: "That file could not be uploaded.",
    fileTooLarge: "That file is {size} MB. The limit is {limit} MB.",
    artworkPlacementTitle: "Position your artwork",
    artworkPlacementHelp:
      "Drag the artwork on the preview, or use the controls below. The preview and the print resolution follow every change.",
    artworkGrabLabel: "{file} placement. Drag to move it, or use the arrow keys; + and − resize it.",
    artworkSize: "Size",
    artworkRotation: "Rotation",
    artworkResolution: "Print resolution",
    artworkRecentre: "Centre it again",
    artworkRemove: "Remove artwork",
    artworkChecksPass: "This artwork is ready to print at this size.",
    artworkChecksFail: "Sort this out before adding to your basket",
    artworkWhatToDo: "What to do: {fix}",
    artworkBlocked: "Fix the artwork above, or remove it, to add this to your basket.",
  },

  basket: {
    title: "Your basket",
    emptyTitle: "Nothing in the basket yet",
    emptyBody:
      "Add a product and any personalisation, and it will appear here with the preview attached to your order.",
    browseShop: "Browse the shop",
    previewAlt: "{name} preview",
    personalisation: "Personalisation:",
    artwork: "Artwork: {file}",
    quantity: "Quantity",
    update: "Update",
    remove: "Remove",
    summary: "Summary",
    subtotal: "Subtotal",
    shipping: "Shipping",
    taxRow: "Tax {rate}%",
    taxIncludedSuffix: "included",
    total: "Total",
    checkout: "Checkout",
    keepShopping: "Keep shopping",
  },

  /**
   * Discount codes, shared by the basket, the checkout and the order page: a
   * code is entered in one place and shown in the other two.
   */
  discount: {
    title: "Discount code",
    label: "Code",
    placeholder: "SPRING10",
    apply: "Apply",
    applying: "Applying…",
    remove: "Remove",
    row: "Discount ({code})",
    applied: "Code {code} applied — {amount} off.",
    removed: "The discount code was removed.",
    enterCode: "Enter a discount code.",
    unknown: "We do not recognise that code.",
    inactive: "That code is no longer active.",
    expired: "That code has expired.",
    limitReached: "That code has been used the maximum number of times.",
    belowMinimum: "That code needs a basket of at least {amount}.",
    dropped:
      "The code {code} no longer applies to this basket, so it has been removed. Check your total before paying.",
  },

  checkout: {
    title: "Checkout",
    merchantNote:
      "{client} is the merchant of record. Payment settles into their own Stripe account.",
    unavailableTitle: "This store cannot take payments yet",
    unavailableBody:
      "The store has not finished connecting its Stripe account. Your basket is saved — try again once the store is live.",
    backToBasket: "Back to basket",
    summaryTitle: "Order summary",
    shipping: "Shipping",
    taxRow: "Tax {rate}%",
    taxIncludedSuffix: "included",
    total: "Total",
    deliveryDetails: "Delivery details",
    fullName: "Full name",
    email: "Email",
    emailHint: "This address and your order code are what open your order page later.",
    street: "Street address",
    city: "Town or city",
    postalCode: "Postal code",
    country: "Country",
    countryHint: "Start typing to find your country. Production is routed by destination.",
    countrySearchPlaceholder: "Search countries",
    countryNoMatch: "No country matches “{query}”.",
    payIn: "Pay in",
    manualRoutingTitle: "Delivery to {country} needs manual routing",
    manualRoutingLine: "{supplier} makes {products} and does not fulfil to {country} ({region}).",
    productJoin: "and",
    manualRoutingBody:
      "You can still pay, but the order will be held for a person to place with another production partner, so it will take longer than the usual lead time. Choosing a delivery country your supplier covers avoids the wait.",
    paymentTitle: "Payment",
    paymentNote:
      "Charged through this store’s own Stripe account {account}. Card details are never stored by the store.",
    cardNumber: "Card number",
    expiry: "Expiry (MM/YY)",
    securityCode: "Security code",
    testMode: "Stripe test mode",
    submit: "Pay and place order",
    pending: "Taking payment…",
    cardSucceeds: "Visa — succeeds",
    cardDeclined: "Visa — declined by issuer",
    cardInsufficient: "Visa — insufficient funds",
  },

  order: {
    title: "Order status",
    lookupIntro:
      "Enter your order code and the email address you gave at checkout. The link you saved when you placed the order opens it directly.",
    gateBody:
      "To protect delivery and personalisation details, confirm the email address on order {code} before we show it.",
    confirmedTitle: "Thank you — your order is confirmed",
    confirmedBody:
      "Save or bookmark this page — it is where the progress of your order is shown. A confirmation email with this link is on its way to you.",
    confirmedFindAgain:
      "You can also find it again from “Order status” with order code {code} and the email address {email}.",
    heading: "Order {code}",
    placed: "Placed {when}",
    trackWith: "Track with {carrier} ↗",
    whatYouOrdered: "What you ordered",
    variantQuantity: "{variant} · quantity {count}",
    personalisation: "Personalisation:",
    previewAlt: "{name} preview",
    subtotal: "Subtotal",
    shipping: "Shipping",
    taxRow: "Tax {rate}%",
    paid: "Paid",
    refunded: "Refunded",
    deliveringTo: "Delivering to",
    payment: "Payment",
    cardEnding: "Card ending {last4}",
    card: "Card",
    paidWord: "paid",
    refundedWord: "refunded",
    merchantOfRecord: "{client} is the merchant of record.",
    progress: "Progress",
    supportTitle: "Questions about this order",
    contactSubject: "Order {code}",
    continueShopping: "Continue shopping",
    contactStore: "Contact the store",
    orderCode: "Order code",
    orderCodeHint: "Starts with ORD- and is shown at the top of your order page.",
    emailOnOrder: "Email on the order",
    emailHint: "The address you gave at checkout.",
    lookupSubmit: "Show my order",
    lookupPending: "Checking…",
  },

  status: {
    awaitingPayment: "Awaiting payment",
    awaitingPaymentNote: "We have not received payment for this order yet.",
    paid: "Payment received",
    paidNote: "Your order is queued for production.",
    inProduction: "In production",
    inProductionNote: "Your item is being printed and finished.",
    shipped: "Shipped",
    shippedNote: "Your parcel is on its way. Track it with the link below.",
    delivered: "Delivered",
    deliveredNote: "Your parcel has been delivered. Enjoy it.",
    cancelled: "Cancelled",
    cancelledNote: "This order was cancelled. Any payment has been refunded.",
    exception: "Needs attention",
    exceptionNote:
      "There is a hold on this order. The store team is on it and will be in touch.",
  },

  actions: {
    storeClosed: "This store is not currently taking orders.",
    productGone: "That product is no longer available.",
    chooseVariant: "Choose a size and colour.",
    outOfStock: "{variant} is out of stock. Pick another option.",
    noTextPersonalisation: "This product cannot be personalised with text.",
    textTooLong: "Keep the personalisation to {max} characters or fewer.",
    noArtworkUpload: "This product does not accept uploaded artwork.",
    productUnavailable: "This product is temporarily unavailable.",
    fileTooLarge: "That file is {size} MB. The limit is {limit} MB.",
    basketUnavailable: "Your basket could not be opened. Enable cookies and retry.",
    addedToBasket: "{product} added to your basket.",
    basketEmpty: "Your basket is empty.",
    enterName: "Enter the name for the delivery.",
    enterEmail: "Enter an email address — it is how you open your order page later.",
    enterStreet: "Enter the street address.",
    enterCity: "Enter the town or city.",
    enterPostalCode: "Enter the postal code.",
    chooseCountry: "Choose your delivery country from the list.",
    currencyNotSold: "{currency} is not one of this store’s selling currencies.",
    enterOrderCode: "Enter your order code.",
    enterOrderEmail: "Enter the email address on the order.",
    lookupFailed: "We could not match that order code and email address. Check both and try again.",
  },

  artwork: {
    lowDpi: "This image will print at {dpi} DPI, below the {required} DPI this product needs.",
    lowDpiFix:
      "Upload one at least {pixels} pixels wide, or make the design smaller — this file is sharp up to {width} mm wide.",
    badFormat: "{format} files are not accepted for this product.",
    badFormatFix: "Save the artwork as {formats} and choose it again.",
    unreadableFormat: "{format} files cannot be measured or previewed here.",
    unreadableFormatFix: "Save the artwork as {formats} and choose it again.",
    fileTooLarge: "That file is {size} MB. The limit is {limit} MB.",
    fileTooLargeFix: "Save it at a smaller size or lower quality, then choose it again.",
    tooManyPixels: "That image is too large. The limit is {megapixels} megapixels.",
    tooManyPixelsFix: "Resize it in your photo editor and choose it again.",
    noTransparency:
      "This product is printed straight onto the fabric, so the artwork needs a transparent background.",
    noTransparencyFix: "Remove the background and save it as a PNG with transparency.",
    outsideArea: "Part of the artwork sits outside the printable area and would be cut off.",
    outsideAreaFix:
      "Drag it back inside the dashed outline, or make it smaller so it fits {width} × {height} mm.",
    dpiTight:
      "This image will print at {dpi} DPI, only just above the {required} DPI minimum.",
    dpiTightFix: "Thin lines may look soft. A larger file, or a slightly smaller design, prints crisper.",
    verySmall: "The design covers less than 15% of the printable width.",
    verySmallFix: "Drag the size slider up if it is meant to be the main graphic.",
    generic: "That artwork cannot be printed on this product.",
    genericFix: "Try a different file.",
  },

  payment: {
    accountNotReady:
      "This store has not finished connecting its Stripe account, so payments are unavailable.",
    currencyUnsupported: "{currency} is not one of this store’s selling currencies.",
    invalidNumber: "That card number is not valid. Check the digits and try again.",
    invalidExpiry: "The expiry date is in the past or badly formatted. Use MM/YY.",
    invalidCvc: "The security code must be 3 or 4 digits.",
    declined: "Your card was declined by the issuing bank.",
    insufficientFunds: "Your card has insufficient funds.",
    expiredCard: "Your card has expired.",
  },

  sections: {
    viewAll: "View all",
    noProducts:
      "No products are published in this store yet. Published products appear here automatically.",
    previewSoon: "Preview coming soon",
    imagePlaceholder: "Add an image URL in the section settings",
    newsletterEmail: "Email address",
    notifyMe: "Notify me",
    welcome: "Welcome",
  },

  /**
   * Transactional email. The store sends these in its own storefront language,
   * so the keys live beside the rest of the shopper-facing copy rather than in
   * the sending code.
   */
  email: {
    logoAlt: "{store}",
    greeting: "Hello {name},",
    footer: "{client} is the merchant of record for this store. Sent by {store}.",
    support: "Questions? Email us at {email}.",
    orderSubject: "Order {code} is confirmed — {store}",
    orderHeading: "Thank you for your order",
    orderBody:
      "We have your order {code} and your payment went through. The link below opens its progress page at any time — it is worth saving.",
    orderCta: "View your order",
    orderTotalLabel: "Total paid",
    orderDeliveryLabel: "Delivering to",
    shippedSubject: "Order {code} is on its way — {store}",
    shippedHeading: "Your parcel is on its way",
    shippedBody: "Order {code} has been handed to {carrier}.",
    shippedTrackingLabel: "Tracking number",
    shippedCta: "Track your parcel",
    inviteSubject: "{inviter} invited you to {store}",
    inviteHeading: "You have been invited to {store}",
    inviteBody:
      "{inviter} has invited you to work on {store} as {role}. Opening the link below creates your account and activates your access. It works once.",
    inviteCta: "Accept the invitation",
    approvalSubject: "Gift campaign {code} needs your approval — {store}",
    approvalHeading: "A gift campaign is waiting for your approval",
    approvalBody:
      "{buyer} submitted “{campaign}” for {company}. Nothing is charged until you approve the list.",
    approvalRecipientsLabel: "Recipients",
    approvalTotalLabel: "Total",
    approvalCta: "Review the list",
  },

  /**
   * The private corporate gift portal: /g/<catalogue>. The portal is the
   * store's own surface, so it reads in the store's storefront language exactly
   * as the shop does — the buyer and the approver are the client's own people.
   */
  gift: {
    chromeSubtitle: "Gift catalogue · {store}",
    private: "Private",
    operatedBy:
      "Operated by {client}, who is the merchant of record. Gifts are made to order and shipped to each recipient individually.",
    supportTitle: "Questions about a campaign:",
    supportPending: "{client} has not published support contact details yet.",
    legal: "© {year} {client}. Corporate gifting powered by Parcelith.",

    closedTitle: "This catalogue is closed",
    closedBody:
      "{company}’s gifting programme is paused. Whoever runs it for you can reopen it — campaigns already placed are unaffected.",

    privateBadge: "Private catalogue",
    inviteBody:
      "{company}’s gift catalogue is open to invited colleagues. Confirm the address it was sent to and you will be let straight in.",
    linkOnlyBody:
      "This catalogue opens from the private link {company}’s programme owner shared. Use that link again, or ask them for a fresh one — links are rotated whenever the programme changes hands.",
    gateEmail: "Work email",
    gateEmailHint: "It has to be one of the addresses your programme owner invited.",
    gateSubmit: "Open the catalogue",
    gatePending: "Checking…",

    introFallback:
      "Gifts for {company}, produced to order and delivered to each recipient individually.",
    startOrder: "Start a bulk order",
    spendLimitLabel: "Spend limit per recipient",
    noLimit: "No limit",
    approvalLabel: "Approval",
    approvalRequired: "Required",
    approvalNotRequired: "Not required",
    recipientsLabel: "Recipients per campaign",
    recipientsUpTo: "Up to {count}",
    emptyTitle: "No gifts available right now",
    emptyBody:
      "Nothing in this catalogue is currently in production. Whoever runs the programme for you will know when it is back.",
    giftsTitle: "Gifts in this catalogue",
    previewSoon: "Preview coming soon",
    overLimit: "Over limit",
    sizes: "Sizes: {sizes}",
    oneSize: "One size",
    overLimitTitle: "Some gifts sit above your spend limit",
    overLimitBody:
      "A recipient listed against one of these is rejected when the list is read, so the row can be changed before anyone is asked to approve it.",
    howItWorks: "How a campaign works",
    step1Title: "Pick the gift",
    step1Body:
      "Everything here is already produced for this programme, in the sizes your people can choose from.",
    step2Title: "Add your recipient list",
    step2Body:
      "Paste it from a spreadsheet or upload a CSV — names, addresses, sizes and an optional message.",
    step3Title: "Approval",
    step3Body: "The list goes to your approver with its total before anything is paid for.",
    step4Title: "One payment, one parcel each",
    step4Body:
      "You are charged once. Every recipient gets their own parcel and their own tracking.",

    orderTitle: "Bulk gift order",
    campaignTitle: "Gift campaign",
    orderIntro:
      "Add everyone you are sending to, with the address the parcel should reach and the size they wear. Check the list as often as you like — nothing is created until you send it{approval}.",
    orderIntroApproval: " for approval",
    paymentPendingTitle: "Payment is not switched on for this store yet",
    paymentPendingBody:
      "You can still build and send a campaign for approval. It cannot be paid for until {client} finishes connecting their payment account.",
    yourApprover: "your approver",

    buyerTitle: "Who is ordering",
    campaignName: "Campaign name",
    campaignNamePlaceholder: "Q4 client gifts",
    buyerName: "Your name",
    orderingAs:
      "Ordering as {email}. Save the campaign link you land on next — no email is sent, and that page is where the approval and the receipt appear.",
    buyerEmail: "Your work email",
    buyerEmailHint:
      "Recorded on the campaign as the buyer. Save the campaign link you land on next — no email is sent, and that page is where the approval and the receipt appear.",
    giftTitle: "The gift",
    giftHint: "Used for every row that does not name a product of its own.",
    giftHintLimit: "Each recipient may be spent up to {amount}.",
    giftHintNoLimit: "There is no spend limit on this programme.",
    listTitle: "Recipients",
    listHintLead: "One person per line, up to {max}. Columns:",
    listHintTail: "A header row is detected automatically, and {product} and {note} are optional.",
    uploadCsv: "Upload a CSV",
    pasteExample: "Paste the example",
    fileLoaded: "Loaded {file}",
    fileTooLarge: "{file} is {size} KB. Recipient lists are under {limit} KB.",
    fileUnreadable: "That file could not be read. Save it as CSV and try again.",
    listLabel: "Recipient list",
    checkList: "Check the list",
    checkPending: "Reading the list…",
    sendForApproval: "Send for approval",
    checkAndSend: "Check and send",
    sendPending: "Working…",
    previewRecipients: "{count} recipients",
    previewToFix: "{count} to fix",
    previewTotal: "{amount} in total",
    previewOverflow: "{count} rows past the limit were not read",
    columnLine: "Line",
    columnRecipient: "Recipient",
    columnGift: "Gift",
    columnDelivered: "Delivered",
    columnDelivery: "Delivery",
    columnValue: "Value",
    noName: "No name",
    subtotal: "Gifts",
    shipping: "Delivery",
    tax: "Tax",
    taxRow: "Tax {rate}%",
    total: "Total",
    approvalNote:
      "Sending puts the campaign in front of {approver}. Nothing is charged until it is approved and you pay.",
    noApprovalNote:
      "This programme needs no approval, so you go straight to payment once the list is clean.",

    linkInvalidTitle: "This campaign link is not valid",
    linkInvalidBody:
      "Campaign links are personal: one for the buyer, one for the approver. Ask for yours to be sent again, or open the catalogue and start a new order.",
    backToCatalogue: "Back to the catalogue",
    campaignSubmitted: "{count} recipients · submitted by {buyer} on {when}",
    waitingTitle: "Waiting for approval",
    waitingBody:
      "{approver} has the list and its total. You can pay as soon as they approve it — nothing has been charged.",
    decisionTitle: "Your decision is recorded",
    decisionBody: "{decision} by {who} on {when}.",
    decisionCanPay: "{buyer} can now pay for it — nothing has been charged to you.",
    decisionApproved: "Approved",
    decisionDeclined: "Declined",
    declinedNoReason: "No reason was given.",
    declinedBody:
      "Start a new order from the catalogue with the changes your approver asked for.",
    orderedTitle: "Paid and in production",
    orderedBody:
      "{count} orders were raised, one per recipient, each with its own delivery and tracking. Follow any of them below.",
    unpayableTitle: "Approved, but the store cannot take payment yet",
    unpayableBody:
      "{client} has not finished connecting their payment account. Your campaign is saved and can be paid for as soon as they have.",
    recipientsTitle: "Recipients",
    track: "Track {code}",
    historyTitle: "History",
    totalsTitle: "Campaign total",
    spendLimitNote: "Spend limit {amount} per recipient.",
    noSpendLimitNote: "No spend limit on this programme.",
    decisionFormTitle: "Your decision",
    paymentTitle: "Payment",
    approvalIntro:
      "{buyer} needs your sign-off before this campaign can be paid for. Approving charges nothing — the buyer pays on their own screen.",
    noteLabel: "Note (required to decline)",
    notePlaceholder: "Approved against the Q4 marketing budget.",
    approve: "Approve {total}",
    approvePending: "Recording your decision…",
    decline: "Decline",
    declinePending: "Recording…",
    paymentIntro:
      "One payment for the whole campaign, charged through the store’s own Stripe account {account}. Every recipient is then raised as their own order with their own tracking.",
    pay: "Pay {total}",
    payPending: "Taking payment…",
    withdraw: "Withdraw this campaign",
    withdrawConfirm: "Withdraw campaign",
    withdrawQuestion: "The list is withdrawn and nobody is charged.",
    withdrawPending: "Working…",
    cancel: "Cancel",

    statusAwaitingApproval: "Awaiting approval",
    statusApproved: "Approved, awaiting payment",
    statusDeclined: "Declined",
    statusOrdered: "Ordered",
    statusCancelled: "Cancelled",

    eyebrow: "Gift portal",
    notFoundTitle: "We cannot find that page",
    notFoundBody:
      "The address may be mistyped, or the campaign or product it pointed at may have been closed since the link was sent. The catalogue itself is still open.",
    notFoundBoundaryBody:
      "The link may have expired, or the gift catalogue may have been closed by the company that set it up. If someone sent you this link, ask them for a current one.",
    errorTitle: "Something went wrong at our end",
    errorBody:
      "This page could not be loaded. Nothing you have submitted has been lost — try again, and if it keeps happening come back in a few minutes.",
    errorRetry: "Try again",
    errorReference: "Reference {digest}",
    goToParcelith: "Go to Parcelith",
  },

  /** Shown by the storefront's not-found and error boundaries. */
  fallback: {
    notFoundTitle: "We cannot find that page",
    notFoundBody:
      "The link may be out of date, or the product may have been taken off sale. Everything {store} sells today is still a click away.",
    browseProducts: "Browse all products",
    errorTitle: "Something went wrong at our end",
    errorBody:
      "This page could not be loaded. Nothing in your basket has been lost — try again, and if it keeps happening come back in a few minutes.",
    errorRetry: "Try again",
    errorHome: "Back to {store}",
    errorReference: "Reference {digest}",
  },
};

export type StorefrontCopy = typeof en;
