// Email verification + disposable detection — used by find-leads, send-campaign, send-worker
// DNS-only validation (no SMTP probes). Deno runtime.

export type EmailStatus = "verified" | "risky" | "invalid" | "unknown";

export interface EmailVerification {
  status: EmailStatus;
  confidence: number;       // 0-100
  is_role: boolean;
  is_disposable: boolean;
  reason: string;
}

// --- Disposable domains (100+) ---
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "10minutemail.com", "trashmail.com", "sharklasers.com",
  "guerrillamailblock.com", "grr.la", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "tempail.com", "tempr.email", "temp-mail.org",
  "mailnesia.com", "mailcatch.com", "trashymail.com", "discard.email",
  "discardmail.com", "mailexpire.com", "fakeinbox.com", "meltmail.com",
  "tempinbox.com", "tempinbox.co.uk", "tempomail.fr", "mailnull.com",
  "tmpmail.net", "tmpmail.org", "10minutemail.co.za", "1chuan.com",
  "maileater.com", "dacoolest.com", "dandikmail.com", "fakemailz.com",
  "getairmail.com", "getmails.eu", "getonemail.com", "girlsundertheinfluence.com",
  "gishpuppy.com", "gowikibooks.com", "gowikicampus.com", "gowikicars.com",
  "gowikifilms.com", "gowikigames.com", "gowikimusic.com", "gowikinetwork.com",
  "gowikitv.com", "harakirimail.com", "h8s.org", "hacccc.com",
  "hightechwebmail.com", "hitbiter.com", "hulapla.de", "hushmail.com",
  "imails.info", "inbox.si", "inboxs.com", "inboxproxy.com",
  "incognitomail.com", "incognitomail.org", "ineec.net", "infocom.zp.ua",
  "inoutmail.de", "inoutmail.eu", "inoutmail.info", "inoutmail.net",
  "ipoo.org", "irish2me.com", "iwi.net", "jetable.com",
  "jetable.fr.nf", "jetable.net", "jqivr.com", "junk1e.com",
  "junkmail.com", "junkmail.ga", "junkmail.gq", "ka Winning.com",
  "kingsq.ga", "lortemail.dk", "lovemeleaveme.com", "lr78.com",
  "lroid.com", "lukop.dk", "m21.cc", "maboard.com",
  "mail-temporaire.fr", "mail.by", "mail.mezimages.net", "mail.zp.ua",
  "mail114.net", "mail1a.de", "mail21.cc", "mail2rss.org",
  "mail333.com", "mail4t.com", "mailbidon.com", "mailblocks.com",
  "mailblog.biz", "mailbucket.org", "mailcat.biz", "mailcatch.com",
  "maildrop.cc", "maildu.de", "maildx.com", "maileater.com",
  "mailed.ro", "maileimer.de", "mailexpire.com", "mailfa.tk",
  "mailforspam.com", "mailfree.ga", "mailfree.gq", "mailfreeon.com",
  "mailfs.com", "mailguard.me", "mailhazard.com", "mailhz.me",
  "mailimate.com", "mailin8r.com", "mailinater.com", "mailinator.com",
  "mailinator.net", "mailinator.org", "mailinator.us", "mailinator2.com",
  "mailincubator.com", "mailismagic.com", "mailmate.com", "mailme.ir",
  "mailme.lv", "mailme24.com", "mailmetrash.com", "mailmoat.com",
  "mailnator.com", "mailnesia.com", "mailnull.com", "mailorg.org",
  "mailpick.biz", "mailproxsy.com", "mailquack.com", "mailrock.biz",
  "mailscrap.com", "mailshell.com", "mailsiphon.com", "mailslite.com",
  "mailtothis.com", "mailtrash.net", "mailtv.net", "mailtv.tv",
  "mailzilla.com", "makemetheking.com", "manifestgenerator.com",
  "manybrain.com", "mbx.cc", "mega.zik.dj", "meinspamschutz.de",
  "meltmail.com", "messagebeamer.de", "mezimages.net", "mfsa.ru",
  "mierdamail.com", "migmail.pl", "migumail.com", "mindless.com",
  "ministry-of-silly-walks.de", "mintemail.com", "misterpinball.de",
  "mmmmail.com", "moakt.com", "mobi.web.id", "mohmal.com",
  "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf", "monumentmail.com",
  "msa.minsmail.com", "mt2015.com", "mx0.wwwnew.eu", "my10minutemail.com",
  "myalias.pw", "mycard.net.ua", "mycleaninbox.net", "myemailboxy.com",
  "mymail-in.net", "mymailoasis.com", "mymailpul.com", "mypacks.net",
  "mypartyclip.de", "myphantom.com", "mysamp.de", "myspaceinc.com",
  "myspaceinc.net", "myspaceinc.org", "myspacepimpedup.com", "mytemp.email",
  "mytempemail.com", "mytempmail.com", "mythrowaway.email", "mytempmail.com",
  "netmails.com", "netmails.net", "neverbox.com", "nice-4u.com",
  "nincsmo.hu", "nnh.com", "no-spam.ws", "noblepioneer.com",
  "nomail.xl.cx", "nomail2me.com", "nomorespamemails.com", "nonspam.eu",
  "nonspammer.de", "noref.in", "nospam.ze.tc", "nospam4.us",
  "nospamfor.us", "nospammail.net", "nospamthanks.info", "nothingtosee.com",
  "nowmymail.com", "nurfuerspam.de", "nus.edu.sg", "nwldx.com",
  "objectmail.com", "obobbo.com", "odnorazovoe.ru", "oneoffemail.com",
  "onewaymail.com", "oopi.org", "ordinaryamerican.net", "otherinbox.com",
  "ourklips.com", "outlawspam.com", "ovpn.to", "owlpic.com",
  "pancakemail.com", "pimpedupmyspace.com", "pjjkp.com", "plexolan.de",
  "poczta.onet.pl", "politikerclub.de", "poofy.org", "pookmail.com",
  "privacy.net", "privatdemail.net", "proxymail.eu", "prtnx.com",
  "punkass.com", "putthisinyouremail.com", "qq.com", "quickinbox.com",
  "quickmail.nl", "rcpt.at", "reallymymail.com", "realtyalerts.ca",
  "recode.me", "recursor.net", "regbypass.com", "regbypass.comsafe-mail.net",
  "rhyta.com", "rklips.com", "rmqkr.net", "royal.net",
  "rppkn.com", "rtrtr.com", "s0ny.net", "safe-mail.net",
  "safersignup.de", "safetymail.info", "safetypost.de", "sandelf.de",
  "saynotospams.com", "scatmail.com", "schafmail.de", "schrott-email.de",
  "secretemail.de", "secure-mail.biz", "selfdestructingmail.com",
  "sendspamhere.com", "shiftmail.com", "shitmail.me", "shitmail.org",
  "shitware.nl", "shmeriously.com", "shortmail.net", "sibmail.com",
  "sinnlos-mail.de", "skeefmail.com", "slaskpost.se", "slipry.net",
  "slutty.horse", "smashmail.de", "smellfear.com", "snakemail.com",
  "sneakemail.com", "sneakymail.de", "snkmail.com", "sofimail.com",
  "sofort-mail.de", "softpls.asia", "sogetthis.com", "soodonims.com",
  "spam.la", "spam.su", "spam4.me", "spamavert.com",
  "spambob.com", "spambob.net", "spambob.org", "spambog.com",
  "spambog.de", "spambog.ru", "spambog.uno", "spambox.info",
  "spambox.irishspringrealty.com", "spambox.us", "spambox.xyz",
  "spamcannon.com", "spamcannon.net", "spamcero.com", "spamcorptastic.com",
  "spamcowboy.com", "spamcowboy.net", "spamcowboy.org", "spamday.com",
  "spamex.com", "spamfighter.cf", "spamfighter.ga", "spamfighter.gq",
  "spamfighter.ml", "spamfighter.tk", "spamfree.eu", "spamfree24.com",
  "spamfree24.de", "spamfree24.eu", "spamfree24.info", "spamfree24.net",
  "spamfree24.org", "spamg.es", "spamgoblin.com", "spamgoblin.net",
  "spamgoblin.org", "spamhater.com", "spamherelots.com", "spamhereplease.com",
  "spamhole.com", "spamify.com", "spaminator.de", "spamkill.info",
  "spaml.com", "spaml.de", "spammotel.com", "spamobox.com",
  "spamoff.de", "spamslicer.com", "spamspot.com", "spamstack.net",
  "spamthis.co.uk", "spamthisplease.com", "spamtrail.com", "spamtrap.ro",
  "speed.1s.fr", "supergreatmail.com", "supermailer.jp", "superrito.com",
  "superstachel.de", "suremail.info", "svk.jp", "sweetxxx.de",
  "tafmail.com", "tagyoureit.com", "talkinator.com", "tapchicuoihoi.com",
  "taxes.sbg.gov.in", "teleworm.us", "temp-mail.org", "temp-mail.ru",
  "temp.bobmail.info", "temp.budaya.my", "temp.email", "temp.felixfelicis.london",
  "temp.liz.it", "temp.pochta.ru", "tempails.com", "tempalias.com",
  "tempemail.biz", "tempemail.co.za", "tempemail.com", "tempemail.net",
  "tempemail.net", "tempinbox.com", "tempinbox.co.uk", "tempmail.eu",
  "tempmail.it", "tempmail.net", "tempmail.org", "tempmail.plus",
  "tempmail2.com", "tempmaildemo.com", "tempmailer.com", "tempmailer.de",
  "tempomail.fr", "temporarily.de", "temporarioemail.com.br", "temporaryemail.net",
  "temporaryemail.us", "temporaryforwarding.com", "temporaryinbox.com",
  "temporarymailaddress.com", "tempemail.net", "tempflood.com",
  "tempgmail.com", "temphmail.com", "tempmail.eu", "tempmailer.com",
  "tempomail.fr", "temporaryinbox.com", "tempthe.net", "tempthe.com",
  "thankyou2010.com", "thc.st", "thecloudindex.com", "thetempmail.com",
  "throwam.com", "throwawayemailaddress.com", "tittbit.in", "tizi.com",
  "tmailinator.com", "toiea.com", "toomail.biz", "topranklist.de",
  "tradermail.info", "trash-amil.com", "trash-me.com", "trash2009.com",
  "trashdevil.com", "trashdevil.de", "trashemail.de", "trashmail.at",
  "trashmail.com", "trashmail.de", "trashmail.me", "trashmail.net",
  "trashmail.org", "trashmail.ws", "trashmailer.com", "trashymail.com",
  "trashymail.net", "trillianpro.com", "turual.com", "twinmail.de",
  "tyldd.com", "uggsrock.com", "umail.net", "upliftnow.com",
  "uplipht.com", "venompen.com", "veryrealliemail.com", "vidchart.com",
  "viditag.com", "viewcastmedia.com", "viewcastmedia.net", "viewcastmedia.org",
  "vikoci.com", "vomoto.com", "vpn.st", "vsimcard.com",
  "vubby.com", "wasteland.rfc822.org", "webemail.me", "weg-werf-email.de",
  "wegwerfadresse.de", "wegwerfemail.com", "wegwerfemail.de", "wegwerfmail.de",
  "wegwerfmail.net", "wegwerfmail.org", "wh4f.org", "whatiaas.com",
  "whatpaas.com", "whyspam.me", "wickmail.net", "wilemail.com",
  "willhackforfood.biz", "willselfdestruct.com", "winemaven.info",
  "wronghead.com", "wuzup.net", "wuzupmail.net", "wwwnew.eu",
  "xagloo.com", "xemaps.com", "xents.com", "xjoi.com",
  "xmaily.com", "xoxy.net", "yapped.net", "yeah.net",
  "yep.it", "yogamaven.com", "yomail.info", "yomail.org",
  "yopmail.com", "yopmail.fr", "yopmail.gq", "you-spam.com",
  "ypmail.webarnak.fr.eu.org", "yuurok.com", "zehnminutenmail.de",
  "1zhuan.com", "33mail.com", "3d-painting.com", "4warding.com",
  "4warding.net", "4warding.org", "5ghgfhfghfgh.tk", "60minutemail.com",
  "675hosting.com", "675hosting.net", "675hosting.org", "6url.com",
  "75hosting.com", "75hosting.net", "75hosting.org", "7tags.com",
  "9ox.net", "a-bc.net", "afrobacon.com", "agedmail.com",
  "ajaxapp.net", "alivance.com", "amilegit.com", "amiri.net",
  "anappthat.com", "ano-mail.net", "anonbox.net", "anonymbox.com",
  "antichef.com", "antichef.net", "antispam.de", "antispammail.de",
  "armyspy.com", "artman-conception.com", "azmeil.tk",
]);

// --- Role email prefixes ---
const ROLE_PREFIXES = new Set([
  "info", "admin", "support", "sales", "contact", "help", "office",
  "hello", "hi", "team", "staff", "webmaster", "postmaster", "hostmaster",
  "abuse", "noc", "security", "billing", "accounts", "marketing", "press",
  "media", "editor", "hr", "jobs", "careers", "recruitment", "enquiries",
  "enquiry", "feedback", "service", "customerservice", "reception",
  "general", "inquiries", "inquiry", "subscribe", "unsubscribe",
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon",
  "daemon", "root", "sysadmin", "it", "dev", "ops", "legal",
]);

// --- Placeholder patterns ---
const PLACEHOLDER_PATTERNS = [
  /^email@email\.com$/i,
  /^test@test\.com$/i,
  /^foo@bar\.com$/i,
  /^xxx@xxx\./i,
  /^you@you/i,
  /^name@domain\./i,
  /^user@user/i,
  /^user@domain\./i,
  /^someone@/i,
  /^example@/i,
  /^sample@/i,
  /^john@/i,
  /^jane@/i,
  /^tom@/i,
  /^bob@/i,
  /^your@/i,
  /^my@/i,
  /^the@/i,
  /^our@/i,
  /^info@email/i,
  /^admin@email/i,
  /^test@/i,
  /^fake@/i,
  /^spam@/i,
  /^mail@mail/i,
];

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function syntaxValid(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function domainFrom(email: string): string {
  return email.split("@")[1]?.toLowerCase().trim() ?? "";
}

function isDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain);
}

function isRoleEmail(local: string): boolean {
  return ROLE_PREFIXES.has(local.split("+")[0].split(".")[0]);
}

function isPlaceholder(email: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(email));
}

async function domainExists(domain: string): Promise<boolean> {
  try {
    const mx = await Deno.resolveDns(domain, "MX");
    if (Array.isArray(mx) && mx.length > 0) return true;
  } catch { /* no MX */ }
  try {
    const a = await Deno.resolveDns(domain, "A");
    if (Array.isArray(a) && a.length > 0) return true;
  } catch { /* no A */ }
  try {
    const aaaa = await Deno.resolveDns(domain, "AAAA");
    if (Array.isArray(aaaa) && aaaa.length > 0) return true;
  } catch { /* no AAAA */ }
  return false;
}

async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const mx = await Deno.resolveDns(domain, "MX");
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

export async function verifyEmail(
  email: string,
  websiteDomain?: string,
): Promise<EmailVerification> {
  const lower = email.toLowerCase().trim();
  const local = lower.split("@")[0] ?? "";
  const domain = domainFrom(lower);

  // Hard-fail: invalid syntax
  if (!syntaxValid(lower)) {
    return { status: "invalid", confidence: 95, is_role: false, is_disposable: false, reason: "invalid syntax" };
  }

  // Hard-fail: placeholder
  if (isPlaceholder(lower)) {
    return { status: "invalid", confidence: 99, is_role: false, is_disposable: false, reason: "placeholder / dummy email" };
  }

  const disposable = isDisposable(domain);
  const role = isRoleEmail(local);
  const domainValid = await domainExists(domain);
  const hasMx = domainValid ? await hasMxRecords(domain) : false;

  // Hard-fail: domain doesn't exist
  if (!domainValid) {
    return { status: "invalid", confidence: 90, is_role: role, is_disposable: disposable, reason: "domain does not exist (no MX/A/AAAA records)" };
  }

  // Hard-fail: disposable
  if (disposable) {
    return { status: "invalid", confidence: 95, is_role: role, is_disposable: true, reason: "disposable / throwaway email provider" };
  }

  // Score it
  let score = 0;
  score += 25; // valid syntax
  score += 25; // domain exists
  score += hasMx ? 25 : 0; // MX records
  if (role) score -= 25;
  if (!hasMx) score -= 20;
  if (websiteDomain && domain === websiteDomain.toLowerCase()) score += 15;

  score = Math.max(0, Math.min(100, score));

  let status: EmailStatus;
  if (score >= 80) status = "verified";
  else if (score >= 60) status = "risky";
  else if (score >= 30) status = "unknown";
  else status = "invalid";

  const reasons: string[] = [];
  if (role) reasons.push("role-based address (info@, admin@, etc.)");
  if (!hasMx) reasons.push("no MX records — mailbox may not exist");
  if (websiteDomain && domain === websiteDomain.toLowerCase()) reasons.push("domain matches business website");

  return {
    status,
    confidence: score,
    is_role: role,
    is_disposable: false,
    reason: reasons.join("; ") || "looks good",
  };
}

export async function verifyEmails(
  emails: string[],
  websiteDomain?: string,
): Promise<Map<string, EmailVerification>> {
  const results = new Map<string, EmailVerification>();
  await Promise.all(
    emails.map(async (email) => {
      const v = await verifyEmail(email, websiteDomain);
      results.set(email.toLowerCase(), v);
    }),
  );
  return results;
}
