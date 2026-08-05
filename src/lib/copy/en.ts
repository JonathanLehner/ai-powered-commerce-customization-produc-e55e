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
    operatedBy: "Operated by {client}. Printed on demand and shipped worldwide.",
    allProducts: "All products",
    orderStatus: "Order status",
    delivery: "Delivery",
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
    shopTitle: "Shop — {store}",
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
    emailHint: "Order confirmation and delivery updates are sent here.",
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
      "Enter the order code from your confirmation and the email address on the order. The link in your confirmation opens the order directly.",
    gateBody:
      "To protect delivery and personalisation details, confirm the email address on order {code} before we show it.",
    confirmedTitle: "Thank you — your order is confirmed",
    confirmedBody:
      "We have emailed a confirmation to {email}. Keep this page bookmarked to follow production and delivery.",
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
    continueShopping: "Continue shopping",
    contactStore: "Contact the store",
    orderCode: "Order code",
    orderCodeHint: "On your order confirmation, starting with ORD-.",
    emailOnOrder: "Email on the order",
    emailHint: "The address the confirmation was sent to.",
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
    enterEmail: "Enter an email address so we can send order updates.",
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
    lowDpi: "That artwork prints at too low a resolution. Upload a file of at least {dpi} DPI.",
    badFormat: "{format} files are not accepted for this product. Upload {formats} instead.",
    fileTooLarge: "That file is {size} MB. The limit is {limit} MB.",
    tooManyPixels: "That image is too large. Resize it below {megapixels} megapixels and try again.",
    noTransparency:
      "This product needs artwork with a transparent background. Export it as a PNG with transparency.",
    generic: "That artwork cannot be printed on this product. Try a different file.",
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
