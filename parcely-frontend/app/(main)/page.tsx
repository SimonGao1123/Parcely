import Homepage from "./_components/homepage";

export default async function Home(props: PageProps<"/">) {
  const { page, order, theme, title } = await props.searchParams;

  return (
    <Homepage
      query={{
        page: typeof page === "string" ? page : undefined,
        order: typeof order === "string" ? order : undefined,
        theme: typeof theme === "string" ? theme : undefined,
        title: typeof title === "string" ? title : undefined,
      }}
    />
  );
}
