import type { GalleryTemplate } from "@/components/TemplateGallery";
import { localizedPath, type Locale } from "@/i18n/locales";
import { srcSetFor } from "../image-variants";
import { TEMPLATES, templateSummary } from "./index";

/** Every template as a gallery card in `locale`: its preview, palette and type. */
export function galleryTemplates(locale: Locale): GalleryTemplate[] {
  return TEMPLATES.map((template) => {
    const summary = templateSummary(template, locale);
    const image = summary.thumbnail;
    return {
      id: template.id,
      category: template.category,
      name: template.name,
      description: summary.description,
      styles: template.styles,
      image,
      imageSrcSet: srcSetFor(image),
      colors: [...new Set([summary.colors.background, summary.colors.primary, summary.colors.text])],
      fonts: summary.fonts.heading === summary.fonts.body ? summary.fonts.heading : `${summary.fonts.heading} + ${summary.fonts.body}`,
      href: localizedPath(`/templates/${template.id}`, locale),
      demoHref: `/demo/${template.id}/${locale}`,
    };
  });
}
