import Link from 'next/link';
import { Github, Twitter, Linkedin } from 'lucide-react';

const footerLinks = {
  product: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/#pricing' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
  ],
  legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ],
  social: [
    { label: 'GitHub', href: '#', icon: Github },
    { label: 'Twitter', href: '#', icon: Twitter },
    { label: 'LinkedIn', href: '#', icon: Linkedin },
  ],
};

export function PremiumFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-var(--border-color) bg-var(--bg-secondary) mt-20 md:mt-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg text-var(--text-primary) hover:text-var(--accent-cyan) transition-colors mb-4"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-var(--accent-cyan) to-var(--accent-magenta) flex items-center justify-center text-var(--text-inverse) font-bold">
                LB
              </div>
              <span>LinkedBoost</span>
            </Link>
            <p className="text-sm text-var(--text-tertiary)">
              LinkedIn automation that goes viral
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold text-var(--text-primary) mb-4 text-sm uppercase tracking-wide">
              Product
            </h3>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-var(--text-secondary) hover:text-var(--accent-cyan) transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-semibold text-var(--text-primary) mb-4 text-sm uppercase tracking-wide">
              Company
            </h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-var(--text-secondary) hover:text-var(--accent-cyan) transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-semibold text-var(--text-primary) mb-4 text-sm uppercase tracking-wide">
              Legal
            </h3>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-var(--text-secondary) hover:text-var(--accent-cyan) transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-var(--border-color) pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-var(--text-tertiary)">
            © {currentYear} LinkedBoost. All rights reserved.
          </p>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            {footerLinks.social.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-var(--text-secondary) hover:text-var(--accent-cyan) transition-colors"
                  aria-label={link.label}
                >
                  <Icon size={20} />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
