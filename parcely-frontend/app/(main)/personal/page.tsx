import PersonalStorefronts from "../_components/personalStorefronts";

export default async function PersonalPage(props: PageProps<"/personal">) {
    const { page, order, theme, title } = await props.searchParams;
    return (
        <PersonalStorefronts query = {{
            page: typeof page === "string" ? page : undefined,
            order: typeof order === "string" ? order : undefined,
            theme: typeof theme === "string" ? theme : undefined,
            title: typeof title === "string" ? title : undefined,
        }}/>
    )
}
