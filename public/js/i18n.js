/* Lightweight i18n for the storefront chrome. English is the source; other languages
 * come from the dictionary below. Elements tagged with data-i18n / data-i18n-ph are
 * translated by applyI18n(). Product data entered in the admin stays as-is. */
(function () {
  const LANGS = { en: 'English', ml: 'മലയാളം', ta: 'தமிழ்', hi: 'हिन्दी' };

  // dictionary keyed by the exact English string
  const TR = {
    // nav
    'Products': { ml: 'ഉൽപ്പന്നങ്ങൾ', ta: 'பொருட்கள்', hi: 'उत्पाद' },
    'Net Parts': { ml: 'വല ഭാഗങ്ങൾ', ta: 'வலை பாகங்கள்', hi: 'जाल के हिस्से' },
    'FAQ': { ml: 'പതിവുചോദ്യങ്ങൾ', ta: 'கேள்விகள்', hi: 'सामान्य प्रश्न' },
    'Contact': { ml: 'ബന്ധപ്പെടുക', ta: 'தொடர்பு', hi: 'संपर्क' },
    'Sign in': { ml: 'സൈൻ ഇൻ', ta: 'உள்நுழைக', hi: 'साइन इन' },
    'Stronger Nets. Safer Seas.': { ml: 'കരുത്തുറ്റ വലകൾ. സുരക്ഷിത കടലുകൾ.', ta: 'வலிமையான வலைகள். பாதுகாப்பான கடல்கள்.', hi: 'मज़बूत जाल. सुरक्षित समुद्र.' },
    // hero
    'Trusted by Commercial Fishing Fleets': { ml: 'വാണിജ്യ മത്സ്യബന്ധന കപ്പൽവ്യൂഹങ്ങളുടെ വിശ്വാസം', ta: 'வணிக மீன்பிடி கப்பல் படைகளின் நம்பிக்கை', hi: 'वाणिज्यिक मछली पकड़ने वाले बेड़ों का भरोसा' },
    'Commercial Marine Equipment': { ml: 'വാണിജ്യ സമുദ്ര ഉപകരണങ്ങൾ', ta: 'வணிக கடல் உபகரணங்கள்', hi: 'वाणिज्यिक समुद्री उपकरण' },
    'Manufacturer & Exporter of Purse Seine Nets, Gill Nets, Fishing Ropes, Floats, Sinkers, and Marine Equipment.': { ml: 'പഴ്സ് സെയിൻ വലകൾ, ഗിൽ വലകൾ, മത്സ്യബന്ധന കയറുകൾ, ഫ്ലോട്ടുകൾ, സിങ്കറുകൾ, സമുദ്ര ഉപകരണങ്ങൾ എന്നിവയുടെ നിർമ്മാതാവും കയറ്റുമതിക്കാരനും.', ta: 'பர்ஸ் சீன் வலைகள், கில் வலைகள், மீன்பிடி கயிறுகள், மிதவைகள், சிங்கர்கள் மற்றும் கடல் உபகரணங்களின் உற்பத்தியாளர் மற்றும் ஏற்றுமதியாளர்.', hi: 'पर्स सीन जाल, गिल जाल, मछली पकड़ने की रस्सियाँ, फ्लोट, सिंकर और समुद्री उपकरण के निर्माता एवं निर्यातक।' },
    'Buy Now': { ml: 'ഇപ്പോൾ വാങ്ങുക', ta: 'இப்போது வாங்கு', hi: 'अभी खरीदें' },
    'Explore Products': { ml: 'ഉൽപ്പന്നങ്ങൾ കാണുക', ta: 'பொருட்களை காண்க', hi: 'उत्पाद देखें' },
    'Premium Quality': { ml: 'മികച്ച ഗുണനിലവാരം', ta: 'உயர்தர தரம்', hi: 'प्रीमियम गुणवत्ता' },
    'High strength & durability': { ml: 'ഉയർന്ന ബലവും ഈടും', ta: 'அதிக வலிமை மற்றும் நீடிப்பு', hi: 'उच्च मजबूती और टिकाऊपन' },
    'Marine Grade': { ml: 'മറൈൻ ഗ്രേഡ്', ta: 'கடல் தரம்', hi: 'मरीन ग्रेड' },
    'Corrosion & UV resistant': { ml: 'തുരുമ്പിനും UV കിരണങ്ങൾക്കും പ്രതിരോധം', ta: 'அரிப்பு மற்றும் UV எதிர்ப்பு', hi: 'जंग और यूवी प्रतिरोधी' },
    'Global Supply': { ml: 'ആഗോള വിതരണം', ta: 'உலகளாவிய விநியோகம்', hi: 'वैश्विक आपूर्ति' },
    'Delivered worldwide': { ml: 'ലോകമെമ്പാടും എത്തിക്കുന്നു', ta: 'உலகம் முழுவதும் வழங்கல்', hi: 'दुनिया भर में डिलीवरी' },
    'Expert Support': { ml: 'വിദഗ്ധ പിന്തുണ', ta: 'நிபுணர் ஆதரவு', hi: 'विशेषज्ञ सहायता' },
    'Always here to help': { ml: 'എപ്പോഴും സഹായത്തിനായി', ta: 'எப்போதும் உதவ தயார்', hi: 'हमेशा मदद के लिए' },
    // sections
    'Our Range': { ml: 'ഞങ്ങളുടെ ശ്രേണി', ta: 'எங்கள் தொகுப்பு', hi: 'हमारी रेंज' },
    'Featured Products': { ml: 'മുഖ്യ ഉൽപ്പന്നങ്ങൾ', ta: 'சிறப்பு பொருட்கள்', hi: 'विशेष उत्पाद' },
    'Interactive': { ml: 'ഇന്ററാക്ടീവ്', ta: 'ஊடாடும்', hi: 'इंटरैक्टिव' },
    'Explore Fishing Net Components': { ml: 'മത്സ്യബന്ധന വലയുടെ ഭാഗങ്ങൾ കാണുക', ta: 'மீன்பிடி வலையின் பாகங்களை ஆராயுங்கள்', hi: 'मछली पकड़ने के जाल के हिस्से देखें' },
    'Net type': { ml: 'വല തരം', ta: 'வலை வகை', hi: 'जाल प्रकार' },
    'Help': { ml: 'സഹായം', ta: 'உதவி', hi: 'सहायता' },
    'Frequently Asked Questions': { ml: 'പതിവായി ചോദിക്കുന്ന ചോദ്യങ്ങൾ', ta: 'அடிக்கடி கேட்கப்படும் கேள்விகள்', hi: 'अक्सर पूछे जाने वाले प्रश्न' },
    'Get in touch': { ml: 'ബന്ധപ്പെടുക', ta: 'தொடர்பு கொள்ளுங்கள்', hi: 'संपर्क करें' },
    'Request a Quote': { ml: 'ക്വോട്ട് അഭ്യർത്ഥിക്കുക', ta: 'விலைப்புள்ளி கோருங்கள்', hi: 'कोटेशन प्राप्त करें' },
    // contact band
    'Fast, no-obligation quotes': { ml: 'വേഗത്തിലുള്ള, ബാധ്യതയില്ലാത്ത ക്വോട്ടുകൾ', ta: 'விரைவான, கட்டாயமில்லாத விலைப்புள்ளிகள்', hi: 'तेज़, बिना बाध्यता कोटेशन' },
    'Send us your specifications and quantity — our team replies with pricing, lead times and samples.': { ml: 'നിങ്ങളുടെ സവിശേഷതകളും അളവും അയയ്ക്കുക — ഞങ്ങളുടെ ടീം വില, ഡെലിവറി സമയം, സാമ്പിളുകൾ എന്നിവ അറിയിക്കും.', ta: 'உங்கள் விவரக்குறிப்புகளையும் அளவையும் அனுப்புங்கள் — எங்கள் குழு விலை, டெலிவரி நேரம் மற்றும் மாதிரிகளுடன் பதிலளிக்கும்.', hi: 'अपने विनिर्देश और मात्रा भेजें — हमारी टीम कीमत, समय और सैंपल के साथ जवाब देगी।' },
    'Shipping & export': { ml: 'ഷിപ്പിംഗും കയറ്റുമതിയും', ta: 'அனுப்புகை & ஏற்றுமதி', hi: 'शिपिंग व निर्यात' },
    'Wholesale pricing': { ml: 'മൊത്ത വില', ta: 'மொத்த விலை', hi: 'होलसेल कीमत' },
    'Sizes & specs': { ml: 'വലുപ്പങ്ങളും സവിശേഷതകളും', ta: 'அளவுகள் & விவரங்கள்', hi: 'आकार व विनिर्देश' },
    'Technical support': { ml: 'സാങ്കേതിക പിന്തുണ', ta: 'தொழில்நுட்ப ஆதரவு', hi: 'तकनीकी सहायता' },
    // form
    'Name': { ml: 'നാമം', ta: 'பெயர்', hi: 'नाम' },
    'Company': { ml: 'കമ്പനി', ta: 'நிறுவனம்', hi: 'कंपनी' },
    'Email': { ml: 'ഇമെയിൽ', ta: 'மின்னஞ்சல்', hi: 'ईमेल' },
    'Phone': { ml: 'ഫോൺ', ta: 'தொலைபேசி', hi: 'फ़ोन' },
    'Product': { ml: 'ഉൽപ്പന്നം', ta: 'பொருள்', hi: 'उत्पाद' },
    'Quantity': { ml: 'അളവ്', ta: 'அளவு', hi: 'मात्रा' },
    'Unit': { ml: 'യൂണിറ്റ്', ta: 'அலகு', hi: 'इकाई' },
    'Message': { ml: 'സന്ദേശം', ta: 'செய்தி', hi: 'संदेश' },
    'Tell us about the specifications you need.': { ml: 'നിങ്ങൾക്ക് വേണ്ട സവിശേഷതകൾ ഞങ്ങളോട് പറയുക.', ta: 'உங்களுக்குத் தேவையான விவரக்குறிப்புகளைச் சொல்லுங்கள்.', hi: 'हमें अपनी आवश्यक विशेषताएँ बताएं।' },
    'Submit Quote': { ml: 'ക്വോട്ട് സമർപ്പിക്കുക', ta: 'விலைப்புள்ளியை சமர்ப்பி', hi: 'कोटेशन भेजें' },
    // product/cards/modals
    'Details': { ml: 'വിശദാംശങ്ങൾ', ta: 'விவரங்கள்', hi: 'विवरण' },
    'Add to Cart': { ml: 'കാർട്ടിൽ ചേർക്കുക', ta: 'கூடையில் சேர்', hi: 'कार्ट में जोड़ें' },
    'View Product': { ml: 'ഉൽപ്പന്നം കാണുക', ta: 'பொருளைக் காண்க', hi: 'उत्पाद देखें' },
    'In Stock': { ml: 'സ്റ്റോക്കുണ്ട്', ta: 'கையிருப்பில் உள்ளது', hi: 'स्टॉक में' },
    'Low Stock': { ml: 'സ്റ്റോക്ക് കുറവാണ്', ta: 'குறைந்த கையிருப்பு', hi: 'कम स्टॉक' },
    'Out of Stock': { ml: 'സ്റ്റോക്ക് ഇല്ല', ta: 'கையிருப்பில் இல்லை', hi: 'स्टॉक ख़त्म' },
    'Made to order': { ml: 'ഓർഡർ പ്രകാരം', ta: 'ஆர்டருக்கு தயார்', hi: 'ऑर्डर पर' },
    'Material': { ml: 'മെറ്റീരിയൽ', ta: 'பொருள்', hi: 'सामग्री' },
    'Available Sizes': { ml: 'ലഭ്യമായ വലുപ്പങ്ങൾ', ta: 'கிடைக்கும் அளவுகள்', hi: 'उपलब्ध आकार' },
    'Availability': { ml: 'ലഭ്യത', ta: 'கிடைக்கும் தன்மை', hi: 'उपलब्धता' },
    'Price': { ml: 'വില', ta: 'விலை', hi: 'कीमत' },
    'Features': { ml: 'സവിശേഷതകൾ', ta: 'சிறப்பம்சங்கள்', hi: 'विशेषताएँ' },
    'Uses & Applications': { ml: 'ഉപയോഗങ്ങൾ', ta: 'பயன்பாடுகள்', hi: 'उपयोग' },
    // cart / checkout
    'Your Cart': { ml: 'നിങ്ങളുടെ കാർട്ട്', ta: 'உங்கள் கூடை', hi: 'आपका कार्ट' },
    'Checkout': { ml: 'ചെക്ക്ഔട്ട്', ta: 'செக்அவுட்', hi: 'चेकआउट' },
    'Subtotal': { ml: 'ഉപആകെ', ta: 'துணை மொத்தம்', hi: 'उप-योग' },
    'Total': { ml: 'ആകെ', ta: 'மொத்தம்', hi: 'कुल' },
    'Place Order': { ml: 'ഓർഡർ നൽകുക', ta: 'ஆர்டர் செய்', hi: 'ऑर्डर करें' },
    'Track Order': { ml: 'ഓർഡർ ട്രാക്ക് ചെയ്യുക', ta: 'ஆர்டரை கண்காணி', hi: 'ऑर्डर ट्रैक करें' },
    'My Orders': { ml: 'എന്റെ ഓർഡറുകൾ', ta: 'எனது ஆர்டர்கள்', hi: 'मेरे ऑर्डर' },
    'Sign out': { ml: 'സൈൻ ഔട്ട്', ta: 'வெளியேறு', hi: 'साइन आउट' },
    // footer
    'Explore': { ml: 'കാണുക', ta: 'ஆராயுங்கள்', hi: 'देखें' },
    'Legal': { ml: 'നിയമപരം', ta: 'சட்டப்பூர்வம்', hi: 'कानूनी' },
    'Privacy Policy': { ml: 'സ്വകാര്യതാ നയം', ta: 'தனியுரிமைக் கொள்கை', hi: 'गोपनीयता नीति' },
    'Terms & Conditions': { ml: 'നിബന്ധനകളും വ്യവസ്ഥകളും', ta: 'விதிமுறைகள் & நிபந்தனைகள்', hi: 'नियम एवं शर्तें' },
    'Search products…': { ml: 'ഉൽപ്പന്നങ്ങൾ തിരയുക…', ta: 'பொருட்களை தேடு…', hi: 'उत्पाद खोजें…' },
  };

  let LANG = localStorage.getItem('mn_lang') || 'en';
  const t = (en) => { if (LANG === 'en') return en; const e = TR[en]; return (e && e[LANG]) || en; };

  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n') || el.textContent.trim();
      el.textContent = t(key);
    });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    document.documentElement.lang = LANG;
  }
  function setLang(l) {
    if (!LANGS[l]) return; LANG = l; localStorage.setItem('mn_lang', l);
    applyI18n(document);
    const lbl = document.querySelector('#langCurrent'); if (lbl) lbl.textContent = l.toUpperCase();
    document.querySelectorAll('#langMenu [data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === l));
    // let the app re-translate any dynamically-built content
    window.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }

  window.i18n = { t, applyI18n, setLang, getLang: () => LANG, LANGS };
  window.t = t; window.applyI18n = applyI18n;

  document.addEventListener('DOMContentLoaded', () => {
    // build the language switcher
    const mount = document.querySelector('#langMount');
    if (mount) {
      mount.innerHTML =
        `<button class="lang-btn" id="langBtn" aria-label="Language">🌐 <span id="langCurrent">${LANG.toUpperCase()}</span></button>
         <div class="lang-menu" id="langMenu" hidden>` +
        Object.entries(LANGS).map(([code, name]) => `<button class="lang-item${code === LANG ? ' on' : ''}" data-lang="${code}">${name}</button>`).join('') +
        `</div>`;
      const btn = mount.querySelector('#langBtn'), menu = mount.querySelector('#langMenu');
      btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
      menu.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { setLang(b.dataset.lang); menu.hidden = true; }));
      document.addEventListener('click', () => { menu.hidden = true; });
    }
    applyI18n(document);
  });
})();
