const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    
    // Validate required fields
    if (!data.email || !data.password || !data.fullName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required fields: email, password, fullName' 
        })
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }

    // Check if email already exists
    const { data: existing, error: checkError } = await supabase
      .from('creators')
      .select('email')
      .eq('email', data.email.toLowerCase())
      .maybeSingle();

    if (checkError) {
      console.error('Database check error:', checkError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error' })
      };
    }

    if (existing) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Email already registered' })
      };
    }

    // Hash password
    const password_hash = await bcrypt.hash(data.password, 10);

    // Insert new creator
    const { data: creator, error: insertError } = await supabase
      .from('creators')
      .insert([
        {
          email: data.email.toLowerCase(),
          password_hash: password_hash,
          full_name: data.fullName,
          phone: data.phone || null,
          instagram: data.instagram || null,
          tiktok: data.tiktok || null
        }
      ])
      .select('id, email, full_name, created_at')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to create account' })
      };
    }

    console.log('Creator signed up:', creator.email);

    // TODO: Send welcome email (future step)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Account created successfully!',
        creator: {
          id: creator.id,
          email: creator.email,
          full_name: creator.full_name
        }
      })
    };

  } catch (error) {
    console.error('Signup error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
