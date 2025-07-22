import { supabase } from "./supabase";

export const findYourRep = async (address: string) => {
  try {
    const response = await fetch(
      `https://v3.openstates.org/people.geo?lat=42.3601&lng=-71.0589&apikey=${process.env.EXPO_PUBLIC_PLURAL_POLICY_API_KEY}`
    );
    const data = await response.json();

    if (!response.ok) {
      console.error("Plural Policy API Error:", data.error);
      return null;
    }

    const officials = await Promise.all(
      data.results.map(async (official: any) => {
        const { data: legislator, error } = await supabase
          .from("legislators")
          .select("id")
          .eq("name", official.name)
          .single();

        if (error) console.error(error);

        return {
          ...official,
          id: legislator?.id,
          email: official.email, // Make sure email is included
        };
      })
    );

    return {
      ...data,
      officials,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
};
