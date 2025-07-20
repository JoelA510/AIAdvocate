import { supabase } from "./supabase";

export const findYourRep = async (address: string) => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/civicinfo/v2/representatives?key=${process.env.EXPO_PUBLIC_GOOGLE_CIVIC_API_KEY}&address=${address}`
    );
    const data = await response.json();

    const officials = await Promise.all(
      data.officials.map(async (official: any) => {
        const { data: legislator, error } = await supabase
          .from("legislators")
          .select("id")
          .eq("name", official.name)
          .single();

        if (error) console.error(error);

        return {
          ...official,
          id: legislator?.id,
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
