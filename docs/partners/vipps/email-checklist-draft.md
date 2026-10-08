To: developer@vippsmobilepay.com
Cc: Fredrik (Vipps partner manager; his address is in his email of 2026-10-06)
Subject: ePayment API-sjekkliste – NewCo AS / Vio Commerce (partner, test-MSN 545865)
Attachments: epayment-checklist-2026-10-08-msn545865.pdf, vipps-merchant-guide-2026-10-08.pdf, vipps-solution-description-2026-10-08.pdf (all in assets/)
Language: Norwegian (the thread with Fredrik is in Norwegian); the PDFs stay in English, the form itself is English.

Hei,

Takk for at dere har satt oss opp som partner med tilgang til testmiljøet. Partneren er NewCo AS; Vio Commerce er plattformen.

Vedlagt ligger den utfylte ePayment API-sjekklisten, løsningsbeskrivelsen og veiledningen for selgere som sjekklisten viser til. Alle referansene i sjekklisten kommer fra testbetalinger gjort 2026-10-08 gjennom vår egen integrasjon på testsalgsenheten 545865 (NewCo AS), så de kan slås opp direkte i testmiljøet.

Kort om hva Vio gjør med Vipps MobilePay:
- Vio er en plattform som lar merkevarer selge produktene sine inne i medieflater (publisistsider, Vev-sider, apper). Hver selger kobler sin egen Vipps-salgsenhet til Vio, eller Vio oppretter en for dem gjennom partnerskapet.
- Vi bruker ePayment til selve betalingen (vanlig og Express, der kunden velger adresse og levering i appen), webhooks for endelig status, Order Management for kvitteringen som vises i appen, og capture / refusjon / kansellering fra selgerens ordreside i Vio.
- Kassen viser den offisielle Vipps MobilePay-knappen (web-komponent) og følger designretningslinjene.

En testside der flyten kan prøves fra start til slutt, på en publisistside som bruker Vio: https://mote-livsstil-hub-vio.replit.app/skjonnhet/guider/vio-test-shoppable-favoritter (åpne et produkt og trykk på Vipps-knappen; betal med testbrukeren dere ga oss).

Si fra om noe i sjekklisten trenger mer detaljer, eller om dere ønsker en gjennomgang, så setter vi gjerne opp et møte.

Med vennlig hilsen
Angelo
NewCo AS – Vio Commerce, vio.live
