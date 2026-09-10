SELECT id, email, gmail_connected, website_url IS NOT NULL AS has_website,
       booking_link IS NOT NULL AS has_booking, phone IS NOT NULL AS has_phone, notify_replies
FROM profiles WHERE id = '39b65a0f-2c1d-48e2-9ee7-a358ba8d0570';