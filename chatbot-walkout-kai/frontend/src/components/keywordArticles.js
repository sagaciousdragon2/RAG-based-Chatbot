// Keyword definitions: keyword -> mini article content
export const KEYWORD_ARTICLES = {
    "UI/UX Design": {
        title: "UI/UX Design",
        content: "Our UI/UX designers craft intuitive, user-centered interfaces that look great and perform even better. From wireframes to pixel-perfect prototypes, we focus on usability, accessibility, and visual appeal to maximize user engagement."
    },
    "UI/UX": {
        title: "UI/UX Design",
        content: "Our UI/UX designers craft intuitive, user-centered interfaces that look great and perform even better. From wireframes to pixel-perfect prototypes, we focus on usability, accessibility, and visual appeal to maximize user engagement."
    },
    "Website Design": {
        title: "Website Design & Development",
        content: "We build responsive, fast, and visually stunning websites — from static landing pages and dynamic CMS-based sites to full-featured e-commerce platforms. Our tech stack includes WordPress, React, and custom solutions tailored to your business."
    },
    "Website Development": {
        title: "Website Design & Development",
        content: "We build responsive, fast, and visually stunning websites — from static landing pages and dynamic CMS-based sites to full-featured e-commerce platforms. Our tech stack includes WordPress, React, and custom solutions tailored to your business."
    },
    "Web Development": {
        title: "Website Design & Development",
        content: "We build responsive, fast, and visually stunning websites — from static landing pages and dynamic CMS-based sites to full-featured e-commerce platforms. Our tech stack includes WordPress, React, and custom solutions tailored to your business."
    },
    "Mobile App": {
        title: "Android & iOS App Development",
        content: "Our mobile team develops high-performance Android and iOS applications with clean code, great UX, and scalable architecture. Whether it's a startup MVP or enterprise app, we deliver on time and on budget."
    },
    "Android": {
        title: "Android App Development",
        content: "We build native and cross-platform Android apps optimized for performance, battery efficiency, and the latest Android standards. Our apps are published successfully on the Google Play Store."
    },
    "iOS": {
        title: "iOS App Development",
        content: "Our iOS developers build sleek, fast, and Apple-compliant applications for iPhone and iPad. We follow Apple's Human Interface Guidelines and ensure seamless App Store approval."
    },
    "SEO": {
        title: "Search Engine Optimization (SEO)",
        content: "Our SEO specialists deliver measurable organic growth through On-Page SEO (meta tags, content optimization), Off-Page SEO (link building, authority), and Technical SEO (site speed, crawlability, schema). We provide transparent reporting and real ROI."
    },
    "Digital Marketing": {
        title: "Digital Marketing",
        content: "Our digital marketing team drives growth through data-driven campaigns: PPC (Google Ads), SMM (Social Media Marketing), SEM (Search Engine Marketing), and Email Marketing. We focus on measurable ROI and long-term brand growth."
    },
    "Content Writing": {
        title: "Professional Content Writing",
        content: "Our industry-savvy writers craft SEO-friendly web copy, blogs, articles, and product descriptions that engage your audience and convert visitors into customers. Every piece is researched, optimized, and aligned with your brand voice."
    },
    "Branding": {
        title: "Branding & Creative Services",
        content: "A strong brand sets you apart. We provide brand strategy, logo design, visual identity systems, and creative assets that communicate your values and resonate with your target audience."
    },
    "E-commerce": {
        title: "E-commerce Solutions",
        content: "We build scalable online stores with seamless checkout experiences, payment gateway integrations, and inventory management. Whether you use WooCommerce, Shopify, or a custom solution, we handle everything from design to deployment."
    },
    "PPC": {
        title: "Pay-Per-Click (PPC) Advertising",
        content: "Our PPC experts run targeted Google Ads and Bing Ads campaigns to drive instant, qualified traffic to your site. We manage bidding, ad copy, landing pages, and A/B tests to maximize your ad spend efficiency."
    },
    "Social Media": {
        title: "Social Media Marketing (SMM)",
        content: "We manage and grow your presence on Facebook, Instagram, LinkedIn, X (Twitter), and more. From content calendars and community management to paid social campaigns, we build real connections with your audience."
    },
    "Email Marketing": {
        title: "Email Marketing",
        content: "We design, write, and automate email campaigns that nurture your leads and retain customers. From welcome sequences to promotional blasts, our emails are personalized, beautifully designed, and optimized for high open rates."
    },
    "Website Maintenance": {
        title: "Website Maintenance & Optimization",
        content: "We keep your website running fast, secure, and up-to-date. Our maintenance plans cover regular updates, performance optimization, security monitoring, backups, and bug fixes so you can focus on your business."
    },
};

// All keywords sorted by length (longest first to avoid partial matches)
export const SORTED_KEYWORDS = Object.keys(KEYWORD_ARTICLES).sort(
    (a, b) => b.length - a.length
);
